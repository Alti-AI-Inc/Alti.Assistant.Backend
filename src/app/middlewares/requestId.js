import crypto from 'crypto';

/**
 * Request ID middleware — generates a unique correlation ID for every request.
 * Attaches it to `req.id` and sends it back as `X-Request-Id` response header.
 * Enables cross-service debugging and log correlation.
 */
const requestIdMiddleware = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};

export default requestIdMiddleware;
