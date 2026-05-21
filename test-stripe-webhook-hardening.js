import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import Stripe from 'stripe';
import mongoose from 'mongoose';
import config from './config/index.js';
import webhookController from './src/app/modules/stripe/webhook.controller.js';
import subscriptionController from './src/app/modules/subscription/subscription.controller.js';
import { paymentController } from './src/app/modules/payment/payment.controller.js';
import BillingAuditLog from './src/app/modules/subscription/billingAuditLog.model.js';
import StripeEvent from './src/app/modules/subscription/stripeEvent.model.js';
import subscriptionService from './src/app/modules/subscription/subscription.service.js';

// Setup dummy configuration for testing
const DUMMY_PRIMARY_SECRET = 'whsec_dummyprimarysecrettest1234567890';
const DUMMY_FALLBACK_SECRET = 'whsec_dummyfallbacksecrettest1234567890';
const DUMMY_ALERT_WEBHOOK = 'https://discord.com/api/webhooks/dummy_id/dummy_token';

// Save original config to restore later
const originalConfig = { ...config.stripe };

// Temporarily override stripe config for the test
config.stripe.webhook_secret = DUMMY_PRIMARY_SECRET;
config.stripe.webhook_secret_fallback = DUMMY_FALLBACK_SECRET;
config.stripe.security_alert_webhook = DUMMY_ALERT_WEBHOOK;

// Stub Mongoose calls to prevent buffering timeouts
BillingAuditLog.create = async (data) => {
  console.log('   [Mock BillingAuditLog.create] called with action:', data.action);
  return data;
};

StripeEvent.findOne = async (query) => {
  console.log('   [Mock StripeEvent.findOne] called with query:', query);
  if (query.eventId && query.eventId.includes('duplicate')) {
    return { eventId: query.eventId };
  }
  return null; // Return null to simulate event not processed yet (replay protection bypass)
};

StripeEvent.create = async (data) => {
  console.log('   [Mock StripeEvent.create] called with event:', data.eventId);
  return data;
};

// Mock mongoose startSession
mongoose.startSession = async () => {
  console.log('   [Mock mongoose.startSession] called');
  return {
    startTransaction: () => {},
    commitTransaction: () => {},
    abortTransaction: () => {},
    endSession: () => {}
  };
};

// Stub subscription service methods to avoid Stripe API and Mongoose operations during controller tests
subscriptionService.processStripeCheckout = async (sessionId) => {
  console.log('   [Mock processStripeCheckout] called with sessionId:', sessionId);
  return { id: 'mock_sub_id' };
};

subscriptionService.updateSubscriptionFromStripe = async (subscription) => {
  console.log('   [Mock updateSubscriptionFromStripe] called');
  return { id: 'mock_sub_id' };
};

subscriptionService.handleInvoicePaymentSucceeded = async (invoice) => {
  console.log('   [Mock handleInvoicePaymentSucceeded] called');
  return { id: 'mock_sub_id' };
};

subscriptionService.handleInvoicePaymentFailed = async (invoice) => {
  console.log('   [Mock handleInvoicePaymentFailed] called');
  return { id: 'mock_sub_id' };
};

subscriptionService.handleDisputeCreated = async (dispute) => {
  console.log('   [Mock handleDisputeCreated] called');
  return { id: 'mock_dispute_id' };
};

subscriptionService.handleDisputeClosed = async (dispute) => {
  console.log('   [Mock handleDisputeClosed] called');
  return { id: 'mock_dispute_id' };
};

// Helper to generate a valid Stripe signature header
function generateStripeSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signaturePayload = `${timestamp}.${payload}`;
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex');
  return `t=${timestamp},v1=${hmac}`;
}

// Helper to invoke controllers wrapped in catchAsync and return response status and body/error
async function testWebhookRequest(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(msg) {
        this.body = msg;
        resolve({ statusCode: this.statusCode, body: this.body });
        return this;
      },
      json(data) {
        this.body = data;
        resolve({ statusCode: this.statusCode, body: this.body });
        return this;
      }
    };

    const next = (err) => {
      if (err) {
        resolve({
          statusCode: err.statusCode || 500,
          error: err,
          message: err.message
        });
      } else {
        resolve({ statusCode: res.statusCode, body: res.body });
      }
    };

    handler(req, res, next).catch((err) => {
      resolve({
        statusCode: err.statusCode || 500,
        error: err,
        message: err.message
      });
    });
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🛡️  STARTING STRIPE WEBHOOK HARDENING & SECURITY VERIFICATION  🛡️');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passedTests++;
    } else {
      console.log(`❌ [FAIL] ${message}`);
      failedTests++;
    }
  }

  // TEST 1: Untrusted Webhook IP Blocked (webhook.controller.js)
  try {
    const req = {
      ip: '198.51.100.42', // Untrusted/external IP
      headers: {
        'stripe-signature': 'sig_mock_123',
        'user-agent': 'PostmanRuntime/7.29.2'
      },
      body: Buffer.from('{"id": "evt_test"}')
    };

    const result = await testWebhookRequest(webhookController.handleStripeWebhook, req);
    assert(
      result.statusCode === 403 && result.message && result.message.includes('untrusted sender source IP'),
      'Webhook Controller: Rejects untrusted IP with 403 Forbidden'
    );
  } catch (err) {
    console.error('Test 1 failed with error:', err);
    failedTests++;
  }

  // TEST 2: Untrusted Webhook IP Blocked (subscription.controller.js)
  try {
    const req = {
      ip: '198.51.100.42', // Untrusted/external IP
      headers: {
        'stripe-signature': 'sig_mock_123',
        'user-agent': 'PostmanRuntime/7.29.2'
      },
      body: Buffer.from('{"id": "evt_test"}')
    };

    const result = await testWebhookRequest(subscriptionController.handleStripeWebhook, req);
    assert(
      result.statusCode === 403 && result.message && result.message.includes('untrusted sender source IP'),
      'Subscription Controller: Rejects untrusted IP with 403 Forbidden'
    );
  } catch (err) {
    console.error('Test 2 failed with error:', err);
    failedTests++;
  }

  // TEST 3: Localhost IP Bypass + Signature Verification (Primary Secret Mismatch)
  try {
    const req = {
      ip: '127.0.0.1', // Localhost loopback
      headers: {
        'stripe-signature': 'sig_invalid_mock_123',
        'user-agent': 'Stripe-Webhook-Simulator'
      },
      body: Buffer.from('{"id": "evt_test"}')
    };

    const result = await testWebhookRequest(webhookController.handleStripeWebhook, req);
    assert(
      result.statusCode === 400 && result.message && result.message.includes('signature verification failed'),
      'Localhost IP bypasses block and gets gated by signature validation (400 Bad Request)'
    );
  } catch (err) {
    console.error('Test 3 failed with error:', err);
    failedTests++;
  }

  // TEST 4: Fallback Signature Verification Success
  try {
    const rawPayload = JSON.stringify({
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_abc',
          customer: 'cus_test_123',
          payment_status: 'paid',
          metadata: {
            userId: '659b85c18f6f874512abcde0',
            tenantId: '659b85c18f6f874512abcde1',
            planName: 'free'
          }
        }
      }
    });

    // Generate valid signature using FALLBACK secret
    const sig = generateStripeSignature(rawPayload, DUMMY_FALLBACK_SECRET);

    const req = {
      ip: '127.0.0.1', // Localhost
      headers: {
        'stripe-signature': sig,
        'user-agent': 'Stripe-Webhook-Simulator'
      },
      body: rawPayload
    };

    const result = await testWebhookRequest(webhookController.handleStripeWebhook, req);
    assert(
      result.statusCode === 200 && result.body && result.body.received === true,
      'Fallback Webhook Secret: Successfully validates signature when primary verification fails but fallback secret is valid'
    );
  } catch (err) {
    console.error('Test 4 failed with error:', err);
    failedTests++;
  }

  // TEST 5: Untrusted Webhook IP Blocked (paymentController.handleWebhook)
  try {
    const req = {
      ip: '198.51.100.42', // Untrusted/external IP
      headers: {
        'stripe-signature': 'sig_mock_123',
        'user-agent': 'PostmanRuntime/7.29.2'
      },
      body: Buffer.from('{"id": "evt_test"}')
    };

    const result = await testWebhookRequest(paymentController.handleWebhook, req);
    assert(
      result.statusCode === 403 && result.body === 'Forbidden: untrusted sender source IP',
      'Payment Controller Webhook: Rejects untrusted IP with 403 Forbidden'
    );
  } catch (err) {
    console.error('Test 5 failed with error:', err);
    failedTests++;
  }

  // TEST 6: Replay / Duplicate Webhook Blocked (webhookController.handleStripeWebhook)
  try {
    const rawPayload = JSON.stringify({
      id: 'evt_duplicate_test_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_abc',
          customer: 'cus_test_123',
          payment_status: 'paid',
          metadata: {
            userId: '659b85c18f6f874512abcde0',
            tenantId: '659b85c18f6f874512abcde1',
            planName: 'free'
          }
        }
      }
    });

    const sig = generateStripeSignature(rawPayload, DUMMY_PRIMARY_SECRET);

    const req = {
      ip: '127.0.0.1', // Localhost
      headers: {
        'stripe-signature': sig,
        'user-agent': 'Stripe-Webhook-Simulator'
      },
      body: rawPayload
    };

    const result = await testWebhookRequest(webhookController.handleStripeWebhook, req);
    assert(
      result.statusCode === 200 && result.body && result.body.received === true && result.body.duplicate === true,
      'Webhook Controller Replay Protection: Successfully detects and discards duplicate events'
    );
  } catch (err) {
    console.error('Test 6 failed with error:', err);
    failedTests++;
  }

  // TEST 7: Replay / Duplicate Webhook Blocked (subscriptionController.handleStripeWebhook)
  try {
    const rawPayload = JSON.stringify({
      id: 'evt_duplicate_test_456',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_abc',
          customer: 'cus_test_123',
          payment_status: 'paid',
          metadata: {
            userId: '659b85c18f6f874512abcde0',
            tenantId: '659b85c18f6f874512abcde1',
            planName: 'free'
          }
        }
      }
    });

    const sig = generateStripeSignature(rawPayload, DUMMY_PRIMARY_SECRET);

    const req = {
      ip: '127.0.0.1', // Localhost
      headers: {
        'stripe-signature': sig,
        'user-agent': 'Stripe-Webhook-Simulator'
      },
      body: rawPayload
    };

    const result = await testWebhookRequest(subscriptionController.handleStripeWebhook, req);
    assert(
      result.statusCode === 200 && result.body && result.body.received === true && result.body.duplicate === true,
      'Subscription Controller Replay Protection: Successfully detects and discards duplicate events'
    );
  } catch (err) {
    console.error('Test 7 failed with error:', err);
    failedTests++;
  }

  // TEST 8: Replay / Duplicate Webhook Blocked (paymentController.handleWebhook)
  try {
    const rawPayload = JSON.stringify({
      id: 'evt_duplicate_test_789',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_abc',
          customer: 'cus_test_123',
          payment_status: 'paid',
          metadata: {
            userId: '659b85c18f6f874512abcde0',
            tenantId: '659b85c18f6f874512abcde1',
            planName: 'free'
          }
        }
      }
    });

    const sig = generateStripeSignature(rawPayload, DUMMY_PRIMARY_SECRET);

    const req = {
      ip: '127.0.0.1', // Localhost
      headers: {
        'stripe-signature': sig,
        'user-agent': 'Stripe-Webhook-Simulator'
      },
      body: rawPayload
    };

    const result = await testWebhookRequest(paymentController.handleWebhook, req);
    assert(
      result.statusCode === 200 && result.body === 'Webhook processed successfully (Duplicate)',
      'Payment Controller Replay Protection: Successfully detects and discards duplicate events'
    );
  } catch (err) {
    console.error('Test 8 failed with error:', err);
    failedTests++;
  }

  // Restore original config
  config.stripe = { ...originalConfig };

  console.log('\n================================================================');
  console.log('🛡️  VERIFICATION COMPLETE  🛡️');
  console.log(`Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
