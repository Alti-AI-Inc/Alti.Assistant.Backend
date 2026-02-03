import express from 'express';
import { paymentController } from './payment.controller.js';
const router = express.Router();


router.route('/create-checkout-session').post(paymentController.createCheckoutSession)
router.route('/admin/all').get(paymentController.getAllSubscriptions)
router.route('/:userId').get(paymentController.getSubscriptionsByUserId)

// Stripe Webhook Handling (Needs raw body)
router.route("/webhook").post(
    express.raw({ type: "application/json" }), 
    paymentController.handleWebhook
);


export const subscriptionRoutes = router;
