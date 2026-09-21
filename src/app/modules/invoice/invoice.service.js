import { logger } from '../../../shared/logger.js';
import Invoice from './invoice.model.js';
import { PLANS } from '../subscription/plans.config.js';

/**
 * Create an invoice from a Stripe invoice.payment_succeeded webhook event.
 * Called from subscription.service.js handleInvoicePaymentSucceeded.
 *
 * @param {object} stripeInvoice - The Stripe invoice object from the webhook
 * @param {string} userId - The MongoDB user ID
 * @returns {Promise<object>} The created invoice
 */
export async function createInvoiceFromStripe(stripeInvoice, userId) {
  try {
    // Skip if we already recorded this Stripe invoice
    const existing = await Invoice.findOne({ stripeInvoiceId: stripeInvoice.id }).lean();
    if (existing) {
      logger.info(`Invoice already exists for Stripe invoice ${stripeInvoice.id}`);
      return existing;
    }

    const invoiceNumber = await Invoice.generateInvoiceNumber();

    // Extract plan info from line items
    const lineItem = stripeInvoice.lines?.data?.[0];
    const planDescription = lineItem?.description || 'Subscription';
    const planId = lineItem?.price?.lookup_key || lineItem?.metadata?.planName || 'subscription';

    const invoice = await Invoice.create({
      userId,
      paidBy: null, // self-paid via Stripe
      stripeInvoiceId: stripeInvoice.id,
      invoiceNumber,
      type: 'subscription',
      status: stripeInvoice.status === 'paid' ? 'paid' : 'pending',
      plan: planId,
      planName: planDescription,
      amount: stripeInvoice.amount_paid || stripeInvoice.total || 0,
      currency: stripeInvoice.currency || 'usd',
      periodStart: new Date((stripeInvoice.period_start || stripeInvoice.created) * 1000),
      periodEnd: new Date((stripeInvoice.period_end || stripeInvoice.created) * 1000 + 30 * 24 * 60 * 60 * 1000),
      lineItems: (stripeInvoice.lines?.data || []).map((item) => ({
        description: item.description || 'Subscription',
        quantity: item.quantity || 1,
        unitAmount: item.price?.unit_amount || item.amount || 0,
        amount: item.amount || 0,
      })),
      paymentMethod: 'stripe',
      stripePaymentIntentId: stripeInvoice.payment_intent || null,
      hostedInvoiceUrl: stripeInvoice.hosted_invoice_url || null,
      invoicePdf: stripeInvoice.invoice_pdf || null,
      description: `Payment for ${planDescription}`,
    });

    logger.info(`Invoice created: ${invoiceNumber} for Stripe invoice ${stripeInvoice.id}`);
    return invoice;
  } catch (err) {
    logger.error(`Failed to create invoice from Stripe: ${err.message}`);
    throw err;
  }
}

/**
 * Create an invoice when a Stripe payment fails.
 * Called from subscription.service.js handleInvoicePaymentFailed.
 *
 * @param {object} stripeInvoice - The Stripe invoice object
 * @param {string} userId - The MongoDB user ID
 * @returns {Promise<object>} The created invoice
 */
export async function createFailedInvoiceFromStripe(stripeInvoice, userId) {
  try {
    const existing = await Invoice.findOne({ stripeInvoiceId: stripeInvoice.id }).lean();
    if (existing) {
      // Update status to failed
      await Invoice.updateOne({ _id: existing._id }, { status: 'failed' });
      return { ...existing, status: 'failed' };
    }

    const invoiceNumber = await Invoice.generateInvoiceNumber();
    const lineItem = stripeInvoice.lines?.data?.[0];

    const invoice = await Invoice.create({
      userId,
      stripeInvoiceId: stripeInvoice.id,
      invoiceNumber,
      type: 'subscription',
      status: 'failed',
      plan: lineItem?.price?.lookup_key || 'subscription',
      planName: lineItem?.description || 'Subscription',
      amount: stripeInvoice.amount_due || 0,
      currency: stripeInvoice.currency || 'usd',
      periodStart: new Date((stripeInvoice.period_start || stripeInvoice.created) * 1000),
      periodEnd: new Date((stripeInvoice.period_end || stripeInvoice.created) * 1000 + 30 * 24 * 60 * 60 * 1000),
      paymentMethod: 'stripe',
      description: 'Payment failed',
    });

    logger.info(`Failed invoice created: ${invoiceNumber}`);
    return invoice;
  } catch (err) {
    logger.error(`Failed to create failed invoice: ${err.message}`);
    throw err;
  }
}

/**
 * Create an internal invoice for a sponsored member plan assignment.
 * Called when an account owner invites a member with a plan.
 *
 * @param {object} params
 * @param {string} params.userId - The sponsored member's user ID
 * @param {string} params.sponsorId - The account owner paying
 * @param {string} params.planId - The plan being assigned
 * @param {string} [params.memberEmail] - The member's email
 * @returns {Promise<object>} The created invoice
 */
export async function createSponsoredInvoice({ userId, sponsorId, planId, memberEmail }) {
  try {
    const plan = PLANS[planId];
    if (!plan) {
      logger.warn(`Unknown planId ${planId} for sponsored invoice`);
      return null;
    }

    // Don't create invoices for free plans
    if (plan.price === 0) return null;

    const invoiceNumber = await Invoice.generateInvoiceNumber();
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const invoice = await Invoice.create({
      userId,
      paidBy: sponsorId,
      invoiceNumber,
      type: 'sponsored',
      status: 'paid',
      plan: planId,
      planName: plan.name,
      amount: plan.price, // cents
      currency: 'usd',
      periodStart: now,
      periodEnd,
      lineItems: [
        {
          description: `${plan.name} plan for ${memberEmail || 'team member'}`,
          quantity: 1,
          unitAmount: plan.price,
          amount: plan.price,
        },
      ],
      paymentMethod: 'sponsored',
      memberEmail: memberEmail || null,
      description: `Sponsored ${plan.name} plan — ${plan.promptLimit} prompts/month`,
    });

    logger.info(`Sponsored invoice created: ${invoiceNumber} for member ${memberEmail}`);
    return invoice;
  } catch (err) {
    logger.error(`Failed to create sponsored invoice: ${err.message}`);
    throw err;
  }
}

export const invoiceService = {
  createInvoiceFromStripe,
  createFailedInvoiceFromStripe,
  createSponsoredInvoice,
};

export default invoiceService;
