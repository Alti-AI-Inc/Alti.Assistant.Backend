import axios from 'axios';
import {
  PRESENTON_CONFIG,
  PRESENTON_ENDPOINTS,
} from '../presentation.constant.js';
import { logger } from '../../../../shared/logger.js';

/**
 * A client for interacting with the Presenton API.
 * This class encapsulates all HTTP requests to the Presenton service,
 * handling request setup, response logging, and error management.
 * @class PresentonAPIClient
 */
class PresentonAPIClient {
  /**
   * Creates an instance of PresentonAPIClient.
   * Initializes an Axios instance with default configuration for the Presenton API,
   * including base URL, headers, timeout, and interceptors for logging.
   * @constructor
   */
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
   * Sends a synchronous request to generate a presentation.
   * The request will wait for the presentation to be fully generated before returning.
   * @param {object} params - The parameters for generating the presentation.
   * @returns {Promise<object>} A promise that resolves with the generated presentation data.
   * @throws {object} Throws a standardized error object if the API call fails.
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
   * Sends an asynchronous request to generate a presentation.
   * The API will immediately return a task ID, which can be used to check the status of the generation process.
   * @param {object} params - The parameters for generating the presentation.
   * @returns {Promise<object>} A promise that resolves with the task details, including a task ID.
   * @throws {object} Throws a standardized error object if the API call fails.
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
   * Checks the status of an asynchronous presentation generation task.
   * @param {string} taskId - The ID of the task to check.
   * @returns {Promise<object>} A promise that resolves with the current status of the task.
   * @throws {object} Throws a standardized error object if the API call fails.
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
   * Retrieves the details of a specific presentation by its ID.
   * @param {string} presentationId - The ID of the presentation to retrieve.
   * @returns {Promise<object>} A promise that resolves with the presentation data.
   * @throws {object} Throws a standardized error object if the API call fails.
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
   * Sends a request to edit an existing presentation.
   * @param {object} params - The parameters for editing the presentation, including `presentationId`.
   * @param {string} params.presentationId - The ID of the presentation to edit.
   * @returns {Promise<object>} A promise that resolves with the updated presentation data or a confirmation.
   * @throws {object} Throws a standardized error object if the API call fails.
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
   * Derives a new presentation from an existing one, applying specified modifications.
   * This method cleans the input parameters to ensure only valid fields are sent to the API.
   * @param {object} params - The parameters for deriving the presentation.
   * @param {string} params.presentationId - The ID of the source presentation.
   * @returns {Promise<object>} A promise that resolves with the newly derived presentation data.
   * @throws {object} Throws a standardized error object if the API call fails.
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
   * Handles and standardizes errors from API calls.
   * It logs the error and throws a new object with a consistent structure.
   * @private
   * @param {Error} error - The original error object, typically from Axios.
   * @param {string} method - The name of the method where the error occurred.
   * @throws {{status: number, message: string, details: object}} Throws a standardized error object.
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

/**
 * A singleton instance of the PresentonAPIClient.
 * Use this instance to make all calls to the Presenton API.
 * @type {PresentonAPIClient}
 */
export const presentonAPIClient = new PresentonAPIClient();