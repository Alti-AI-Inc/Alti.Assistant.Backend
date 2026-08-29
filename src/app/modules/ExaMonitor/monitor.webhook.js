import crypto from 'crypto';

/**
 * Verifies an inbound Exa webhook request against the monitor's stored
 * webhookSecret.
 *
 * Exa signs deliveries with a header of the form:
 *   Exa-Signature: t=<unix_timestamp>,v1=<hex_hmac_sha256>
 *
 * The signed payload is `${t}.${rawRequestBody}` — this MUST be the
 * exact raw bytes Exa sent, before any JSON parsing/reformatting,
 * or the signature will never match. See monitor.webhook.route.js for
 * how the raw body is preserved.
 *
 * @param {string} rawBody - the exact raw request body string
 * @param {string} signatureHeader - the `Exa-Signature` header value
 * @param {string} secret - this monitor's stored webhookSecret
 * @returns {boolean}
 */
export const verifyExaWebhookSignature = (rawBody, signatureHeader, secret) => {
  if (!rawBody || !signatureHeader || !secret) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [key, ...rest] = p.split('=');
      return [key, rest.join('=')];
    })
  );

  if (!parts.t || !parts.v1) return false;

  const signedPayload = `${parts.t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(parts.v1);

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};