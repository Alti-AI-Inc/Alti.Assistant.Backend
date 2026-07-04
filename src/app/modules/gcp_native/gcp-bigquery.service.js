import { google } from 'googleapis';
import https from 'https'; // For creating a custom agent with keep-alive
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const keyFile = config.google.google_application_credentials || 'alti_gcp.json';
const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: ['https://www.googleapis.com/auth/bigquery']
});

// GCP Resiliency: Create a custom HTTPS agent to enable TCP Keep-Alive.
// This is crucial for maintaining stable connections over long periods,
// especially through network components like the Cloud SQL Auth Proxy or VPC Peering,
// by preventing idle connections from being terminated by firewalls or NATs.
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000, // How often to send keep-alive packets (e.g., every 60 seconds).
  maxSockets: 100,       // Max number of sockets to allow per host. Acts as a connection pool size.
  maxFreeSockets: 10,    // Max number of sockets to leave open in a free state.
  timeout: 60000,        // Socket timeout in milliseconds.
});

const bigquery = google.bigquery({
  version: 'v2',
  auth,
  // GCP Resiliency: Apply gaxios options for robust HTTP communication.
  // These settings are passed to the underlying HTTP client for each API call.
  timeout: 30000, // 30-second timeout for each API request to complete.
  retryConfig: {
    // Retry on transient network errors and specific server-side errors (e.g., 5xx, 429).
    retry: 3,                 // Number of retries on failure.
    noResponseRetries: 3,     // Retries on requests that receive no response (e.g., socket timeout).
    retryDelay: 100,          // Initial delay in ms, increases exponentially.
    httpMethodsToRetry: ['GET', 'PUT', 'POST', 'DELETE'], // Methods considered safe for retries.
    statusCodesToRetry: [
      [100, 199], // Informational responses
      [429, 429], // Rate limited
      [500, 599], // Server-side errors
    ],
  },
  // Use the custom agent for connection pooling (via maxSockets) and keep-alive.
  // This reuses TCP connections for multiple API requests, improving performance.
  agent: httpsAgent,
});

/**
 * Creates a brand new BigQuery Dataset.
 * 
 * @param {string} datasetId - Dataset identifier
 * @param {string} [location] - Location (defaults to 'US')
 * @returns {Promise<object>} Dataset creation report
 */
const createDataset = async (datasetId, location = 'US') => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`BigQuery: Creating dataset "${datasetId}" in project "${projectId}"...`);

    const response = await bigquery.datasets.insert({
      projectId,
      requestBody: {
        datasetReference: {
          projectId,
          datasetId
        },
        location
      }
    });

    return {
      success: true,
      projectId,
      datasetId: response.data.datasetReference?.datasetId,
      location: response.data.location
    };
  } catch (err) {
    logger.error('BigQuery Dataset Insertion Error:', err);
    throw new Error(`BigQuery Dataset creation failed: ${err.message}`);
  }
};

/**
 * Creates a new schema-enforced table inside a BigQuery Dataset.
 * 
 * @param {string} datasetId - Dataset ID
 * @param {string} tableId - Table ID
 * @param {Array<object>} schemaFields - Table schema fields (e.g. [{ name: 'ticker', type: 'STRING' }, { name: 'price', type: 'FLOAT' }])
 * @returns {Promise<object>} Table creation report
 */
const createTable = async (datasetId, tableId, schemaFields) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`BigQuery: Creating table "${datasetId}.${tableId}"...`);

    const response = await bigquery.tables.insert({
      projectId,
      datasetId,
      requestBody: {
        tableReference: {
          projectId,
          datasetId,
          tableId
        },
        schema: {
          fields: schemaFields
        }
      }
    });

    return {
      success: true,
      projectId,
      datasetId,
      tableId: response.data.tableReference?.tableId,
      numBytes: parseFloat(response.data.numBytes || '0'),
      schema: response.data.schema
    };
  } catch (err) {
    logger.error('BigQuery Table Insertion Error:', err);
    throw new Error(`BigQuery Table creation failed: ${err.message}`);
  }
};

/**
 * Programmatically loads a CSV file from a GCS bucket into a BigQuery table.
 * 
 * @param {string} datasetId - Dataset ID
 * @param {string} tableId - Table ID
 * @param {string} gcsUri - GCS URI (e.g. 'gs://bucket/data.csv')
 * @returns {Promise<object>} Ingestion job report
 */
const loadCsvFromGcs = async (datasetId, tableId, gcsUri) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`BigQuery: Loading CSV from GCS URI "${gcsUri}" into table "${datasetId}.${tableId}"...`);

    const response = await bigquery.jobs.insert({
      projectId,
      requestBody: {
        configuration: {
          load: {
            sourceUris: [gcsUri],
            destinationTable: {
              projectId,
              datasetId,
              tableId
            },
            sourceFormat: 'CSV',
            skipLeadingRows: 1, // Ignore CSV headers
            writeDisposition: 'WRITE_APPEND' // Append data
          }
        }
      }
    });

    return {
      success: true,
      jobId: response.data.jobReference?.jobId,
      state: response.data.status?.state,
      configuration: response.data.configuration
    };
  } catch (err) {
    logger.error('BigQuery CSV Ingestion Error:', err);
    throw new Error(`BigQuery GCS CSV load failed: ${err.message}`);
  }
};

export const GcpBigqueryService = {
  createDataset,
  createTable,
  loadCsvFromGcs
};