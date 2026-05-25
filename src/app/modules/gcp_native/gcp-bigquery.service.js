import { google } from 'googleapis';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const keyFile = config.google.google_application_credentials || 'alti_gcp.json';
const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: ['https://www.googleapis.com/auth/bigquery']
});

const bigquery = google.bigquery({ version: 'v2', auth });

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
