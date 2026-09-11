import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { ExaResearchService } from './exaResearch.service.js';

// req.body must be the RAW bytes Exa signed — mount this route with
// express.raw({ type: 'application/json' }) BEFORE any global express.json()
// middleware runs on it (see exaResearch.webhook.route.js). No auth()
// middleware here: Exa calls this endpoint directly, not an app user.
const handleWebsetWebhook = catchAsync(async (req, res) => {
  const secret = process.env.EXA_WEBHOOK_SECRET;
  if (!secret) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'EXA_WEBHOOK_SECRET is not configured.'
    );
  }

  const signatureHeader = req.headers['exa-signature'];
  if (!signatureHeader) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Missing Exa-Signature header.'
    );
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body));

  const isValid = ExaResearchService.verifyWebhookSignature(
    rawBody,
    signatureHeader,
    secret
  );
  if (!isValid) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid webhook signature.');
  }

  const event = JSON.parse(rawBody.toString('utf8'));
  await ExaResearchService.applyWebsetWebhookEvent(event.type, event.data);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Webhook processed',
    data: null,
  });
});

export const ResearchWebhookController = { handleWebsetWebhook };
