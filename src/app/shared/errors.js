import AppError from '../../shared/errors/AppError.js';

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
  AuthorizationError,
  InsufficientCreditsError,
  RateLimitError,
  ServiceError
};
