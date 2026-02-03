import { ZodError } from 'zod';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import handleCastError from '../../../errors/handleCastError.js';
import handleValidationError from '../../../errors/handleValidationError.js';
import handleZodError from '../../../errors/handleZodError.js';
import { errorlogger } from '../../../shared/logger.js';

const globalErrorHandler = (error, req, res, next) => {
  if (config.env === 'development') {
    logger.info('🟢 globalErrorHandler ~', error);
  } else {
    errorlogger.error('🔴 globalErrorHandler ~', error);
  }

  let statusCode = 500;
  let message = 'Something went wrong!';
  let errorMessages = [];

  if (error && error.name === 'ValidationError') {
    const simplifiedError = handleValidationError(error);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorMessages = simplifiedError.errorMessages;
  } else if (error instanceof ZodError) {
    const simplifiedError = handleZodError(error);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorMessages = simplifiedError.errorMessages;
  } else if (error && error.name === 'CastError') {
    const simplifiedError = handleCastError(error);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorMessages = simplifiedError.errorMessages;
  } else if (error instanceof ApiError) {
    statusCode = error ? error.statusCode : statusCode;
    message = error ? error.message : message;
    errorMessages =
      error && error.message ? [{ path: '', message: error.message }] : [];
  } else if (error instanceof Error) {
    message = error ? error.message : message;
    errorMessages =
      error && error.message ? [{ path: '', message: error.message }] : [];
  }

  res.status(statusCode).json({
    status: false,
    message,
    errorMessages,
    stack:
      config.env !== 'production'
        ? error
          ? error.stack
          : undefined
        : undefined,
  });
};

export default globalErrorHandler;
