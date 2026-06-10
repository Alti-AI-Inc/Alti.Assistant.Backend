import AppError from './AppError.js';

export class ServiceError extends AppError {
  constructor(message = 'Internal service error') {
    super(message, 500, 'SERVICE_ERROR');
  }
}

export default ServiceError;
