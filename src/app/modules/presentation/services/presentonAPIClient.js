import axios from 'axios';
import { PRESENTON_CONFIG, PRESENTON_ENDPOINTS } from '../presentation.constant.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Presenton API Client
 * Handles all HTTP requests to Presenton API
 */
class PresentonAPIClient {
  constructor() {
    this.baseURL = PRESENTON_CONFIG.BASE_URL;
    this.apiKey = PRESENTON_CONFIG.API_KEY;

    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 120000, // 120 seconds timeout
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.info(`Presenton API Success: ${response.config.method?.toUpperCase()} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error('Presenton API Error:', {
          method: error.config?.method,
          url: error.config?.url,
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
        });
        throw error;
      }
    );
  }

  /**
   * Generate presentation synchronously
   */
  async generatePresentation(params) {
    try {
      const response = await this.client.post(PRESENTON_ENDPOINTS.GENERATE, params);
      return response.data;
    } catch (error) {
      console.log('Error in generatePresentation:', error);
      this._handleError(error, 'generatePresentation');
    }
  }

  /**
   * Generate presentation asynchronously
   */
  async generatePresentationAsync(params) {
    try {
      const response = await this.client.post(PRESENTON_ENDPOINTS.GENERATE_ASYNC, params);
      return response.data;
    } catch (error) {
      this._handleError(error, 'generatePresentationAsync');
    }
  }

  /**
   * Check async task status
   */
  async checkTaskStatus(taskId) {
    try {
      const response = await this.client.get(`${PRESENTON_ENDPOINTS.CHECK_STATUS}/${taskId}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'checkTaskStatus');
    }
  }

  /**
   * Get presentation details
   */
  async getPresentation(presentationId) {
    try {
      const response = await this.client.get(`${PRESENTON_ENDPOINTS.GET_PRESENTATION}/${presentationId}`);
      return response.data;
    } catch (error) {
      this._handleError(error, 'getPresentation');
    }
  }

  /**
   * Edit existing presentation
   */
  async editPresentation(params) {
    try {
      const response = await this.client.post(PRESENTON_ENDPOINTS.EDIT, params);
      return response.data;
    } catch (error) {
      this._handleError(error, 'editPresentation');
    }
  }

  /**
   * Derive new presentation from existing one
   */
  async derivePresentation(params) {
    try {
      const response = await this.client.post(PRESENTON_ENDPOINTS.DERIVE, params);
      return response.data;
    } catch (error) {
      this._handleError(error, 'derivePresentation');
    }
  }

  /**
   * Handle API errors
   */
  _handleError(error, method) {
    const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
    const statusCode = error.response?.status || 500;

    logger.error(`Presenton API ${method} failed:`, {
      status: statusCode,
      message: errorMessage,
      data: error.response?.data,
    });

    throw {
      status: statusCode,
      message: errorMessage,
      details: error.response?.data,
    };
  }
}

// Export singleton instance
export const presentonAPIClient = new PresentonAPIClient();
