# Changelog

All notable changes to this project will be documented in this file.

## [1.3.5] - 2026-05-21

### Added
- **Centralized Stripe Security Helper**: Extracted dynamic Stripe Webhook IP firewall logic into `src/shared/stripeSecurity.js` as a single, reusable source of truth.
- **Zero-Delay Startup Firewall**: Pre-fetches Stripe's official IP ranges on application startup inside `index.js` to ensure the firewall is warm and reactive before any traffic hits.
- **Replay Attack Shielding**: Integrated MongoDB-backed replay protection across all three webhook entrypoints (`/api/v1/stripe/webhook`, `/api/v1/subscription/webhook`, and `/api/v1/payment/webhook`) leveraging the `StripeEvent` model.
- **Background Sync Outage Alerts**: Implemented tracking of consecutive network/Stripe API errors in the hourly subscription sync cron job (`syncStripeSubscriptions.js`). Triggers high-priority Slack/Discord alerts when consecutive failures exceed a threshold of 3.
- **Robust E2E Webhook Test Suite**: Extended `test-stripe-webhook-hardening.js` to cover the legacy payment webhook and verify replay attack shielding on all entrypoints.

### Changed
- Refactored `webhook.controller.js` to consume the centralized security module and add replay attack checks.
- Refactored `subscription.controller.js` to consume the centralized security helper.
- Refactored `payment.service.js` to consume the centralized security helper and add replay attack checks.
