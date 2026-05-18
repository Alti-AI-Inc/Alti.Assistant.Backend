import axios from 'axios';
import {
  PRESENTON_CONFIG,
  PRESENTON_ENDPOINTS,
} from '../presentation.constant.js';
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
        // Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 120000, // 120 seconds timeout
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.info(
          `Presenton API Success: ${response.config.method?.toUpperCase()} ${response.config.url}`
        );
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
      const response = await this.client.post(
        PRESENTON_ENDPOINTS.GENERATE,
        params
      );
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
      const response = await this.client.post(
        PRESENTON_ENDPOINTS.GENERATE_ASYNC,
        params
      );
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
      const response = await this.client.get(
        `${PRESENTON_ENDPOINTS.CHECK_STATUS}/${taskId}`
      );
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
      const response = await this.client.get(
        `${PRESENTON_ENDPOINTS.GET_PRESENTATION}/${presentationId}`
      );
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
      console.log('Edit presentation with params:', JSON.stringify(params));
      if (params.presentationId) {
        params.presentation_id = params.presentationId;
        delete params.presentationId;
      }
      const response = await this.client.post(PRESENTON_ENDPOINTS.EDIT, params);
      console.log('Edit presentation response:', JSON.stringify(response.data));
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
      console.log('Derive presentation with params:', params);

      // Clean params - only send valid API parameters
      const apiParams = {
        presentation_id: params.presentationId || params.presentation_id,
      };

      // Add valid generation parameters
      const validParams = [
        'content',
        'title',
        'n_slides',
        'language',
        'template',
        'theme',
        'tone',
        'verbosity',
        'image_type',
        'export_as',
        'web_search',
        'include_table_of_contents',
        'include_title_slide',
      ];

      validParams.forEach((param) => {
        if (params[param] !== undefined && params[param] !== null) {
          apiParams[param] = params[param];
        }
      });

      // Handle slides parameter - only include if it's an array (for actual slide edits)
      if (params.slides && Array.isArray(params.slides)) {
        apiParams.slides = params.slides;
      }

      console.log('Cleaned API params:', apiParams);
      const response = await this.client.post(
        PRESENTON_ENDPOINTS.DERIVE,
        apiParams
      );
      return response.data;
    } catch (error) {
      this._handleError(error, 'derivePresentation');
    }
  }

  /**
   * Handle API errors
   */
  _handleError(error, method) {
    const errorMessage =
      error.response?.data?.message || error.message || 'Unknown error';
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
