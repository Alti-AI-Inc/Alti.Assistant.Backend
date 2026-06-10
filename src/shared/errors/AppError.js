export class AppError extends Error {
  constructor(message, statusCode, errorCode = null) {
    super(message);
    this.statusCode = statusCode || 500;
    this.errorCode = errorCode;
    this.success = false;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
