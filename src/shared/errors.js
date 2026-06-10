import AppError from './errors/AppError.js';

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class UsageLimitError extends AppError {
  constructor(message = 'Usage limit exceeded') {
    super(message, 429, 'USAGE_LIMIT_EXCEEDED');
  }
}

export class UsageLimitExceededError extends AppError {
  constructor(message = 'Usage limit exceeded') {
    super(message, 429, 'USAGE_LIMIT_EXCEEDED');
  }
}

export class QuotaExceededError extends AppError {
  constructor(message = 'Quota exceeded') {
    super(message, 429, 'QUOTA_EXCEEDED');
  }
}

export class PermissionDeniedError extends AppError {
  constructor(message = 'Permission denied') {
    super(message, 403, 'PERMISSION_DENIED');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'AUTHORIZATION_ERROR');
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(message = 'Insufficient credits') {
    super(message, 402, 'INSUFFICIENT_CREDITS');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

export class ServiceError extends AppError {
  constructor(message = 'Internal service error') {
    super(message, 500, 'SERVICE_ERROR');
  }
}

export { AppError };
export default {
  AppError,
  ForbiddenError,
  UsageLimitError,
  UsageLimitExceededError,
  QuotaExceededError,
  PermissionDeniedError,
  AuthorizationError,
  InsufficientCreditsError,
  RateLimitError,
  ServiceError
};
