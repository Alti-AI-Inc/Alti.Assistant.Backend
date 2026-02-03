import moment from 'moment';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import winston from 'winston';
import config from '../../../../config/index.js';
import { sendMailWithMailGun } from '../../middlewares/sendEmail/sendMailWithMailGun.js';
import UserModel from '../auth/auth.model.js';
import SubscriptionModel from './payment.model.js';
import { purchasePlanTemplate } from './payment.utils.js';
import { logger } from '../../../shared/logger.js';

const stripe = new Stripe(config.stripe.stripe_secret_key);


const createCheckoutSessionService = async (user, plan) => {
  if (!['explore', 'analyze', 'execute', 'command'].includes(plan.plan_name)) {
    throw new Error('Invalid plan name');
  }
  if (!['month', 'year'].includes(plan.duration)) {
    throw new Error('Invalid plan duration');
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: plan.plan_name },
          unit_amount: plan.price * 100,
          recurring: { interval: plan.duration },
        },
        quantity: 1,
      },
    ],
    mode: 'subscription',
    metadata: {
      plan_name: plan.plan_name,
      duration: plan.duration,
    },
    // success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    success_url: `${config.client_url}`,
    cancel_url: `${config.client_url}`,

  });

  return session.url;
};

const handleWebhookService = async (req, res) => {
  const endpointSecret = config.stripe.stripe_webhook_secret_key;
  const sig = req.headers['stripe-signature'];

  if (!sig || !endpointSecret) {
    logger.error('Missing Stripe signature or webhook secret');
    return res
      .status(400)
      .send('Webhook Error: Missing Stripe Signature or Secret');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    logger.info('Webhook event received', { eventType: event.type });
  } catch (err) {
    logger.error('Webhook signature verification failed', {
      message: err.message,
    });
    return res
      .status(400)
      .send(`Webhook signature verification failed: ${err.message}`);
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    logger.info('Processing event', { eventType: event.type });

    if (event.type === 'checkout.session.completed') {
      const stripeSession = event.data.object;
      logger.info('Checkout session data', { sessionId: stripeSession.id });

      // Validate metadata
      if (
        !stripeSession.metadata.plan_name ||
        !stripeSession.metadata.duration
      ) {
        logger.error('Missing plan_name or duration in session metadata', {
          metadata: stripeSession.metadata,
        });
        throw new Error('Invalid session metadata');
      }

      // Find user
      const user = await UserModel.findOne({
        email: stripeSession.customer_email,
      }).session(session);
      if (!user) {
        logger.warn('No user found', { email: stripeSession.customer_email });
        throw new Error('User not found');
      }

      // Check for existing subscription to prevent duplicates
      const existingSubscription = await SubscriptionModel.findOne({
        transactionId: stripeSession.id,
      }).session(session);
      if (existingSubscription) {
        logger.warn('Subscription already exists', {
          transactionId: stripeSession.id,
        });
        await session.commitTransaction();
        return res.status(200).send('Webhook processed successfully');
      }

      // Prepare subscription data and fetch invoiceUrl
      let invoiceUrl = null;
      if (stripeSession.subscription) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(
            stripeSession.subscription,
          );
          if (stripeSubscription.latest_invoice) {
            const invoice = await stripe.invoices.retrieve(
              stripeSubscription.latest_invoice,
            );
            invoiceUrl = invoice.hosted_invoice_url;
          }
        } catch (error) {
          logger.error('Error retrieving invoice', { message: error.message });
        }
      }

      const subscriptionData = {
        userId: user._id,
        transactionId: stripeSession.id,
        price: stripeSession.amount_total / 100,
        plan_name: stripeSession.metadata.plan_name,
        duration: stripeSession.metadata.duration,
        expiresAt: getExpirationDate(stripeSession.metadata.duration),
        paymentStatus: stripeSession.payment_status || 'pending',
        invoiceUrl,
      };

      // Save subscription
      const newSubscription = new SubscriptionModel(subscriptionData);
      await newSubscription.save({ session });
      logger.info('Subscription saved', {
        subscriptionId: newSubscription._id,
      });

      // Update user with invoiceUrl
      user.isSubscribed = true;
      user.subscription = {
        price: stripeSession.amount_total / 100,
        plan_name: stripeSession.metadata.plan_name,
        duration: stripeSession.metadata.duration,
        expiresAt: getExpirationDate(stripeSession.metadata.duration),
        status: 'paid',
        invoiceUrl, // Added invoiceUrl
      };
      await user.save({ session });
      logger.info('User updated', { email: user.email });

      // Send email confirmation
      try {
        const mailData = await purchasePlanTemplate(
          user.email,
          user,
          newSubscription,
        );
        await sendMailWithMailGun(mailData);
        logger.info('Confirmation email sent', { email: user.email });
      } catch (emailError) {
        logger.error('Failed to send confirmation email', {
          email: user.email,
          message: emailError.message,
        });
      }

      await session.commitTransaction();
      logger.info('Subscription created and user updated successfully', {
        userId: user._id,
      });
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;

      const existingSubscription = await SubscriptionModel.findOne({
        transactionId: subscription.id,
      }).session(session);
      if (existingSubscription) {
        existingSubscription.paymentStatus = 'expired';
        await existingSubscription.save({ session });

        const user = await UserModel.findById(
          existingSubscription.userId,
        ).session(session);
        if (user) {
          user.isSubscribed = false;
          user.subscription = null;
          await user.save({ session });
          logger.info('User subscription status updated', {
            email: user.email,
          });
        }

        await session.commitTransaction();
        logger.info('Subscription marked as expired', {
          transactionId: subscription.id,
        });
      }
    }

    res.status(200).send('Webhook processed successfully');
  } catch (error) {
    logger.error('Error processing webhook', {
      message: error.message,
      stack: error.stack,
    });
    await session.abortTransaction();
    res.status(500).send(`Internal server error: ${error.message}`);
  } finally {
    session.endSession();
  }
};

const getExpirationDate = duration => {
  return duration === 'month'
    ? moment().add(1, 'months').toDate()
    : moment().add(1, 'years').toDate();
};

export const PaymentService = {
  createCheckoutSessionService,
  handleWebhookService,
};
