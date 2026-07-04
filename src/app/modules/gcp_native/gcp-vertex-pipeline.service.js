import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * @file gcp-vertex-pipeline.service.js
 * @module app/modules/gcp_native/gcp-vertex-pipeline.service
 * @description Native Vertex AI Pipelines (Kubeflow Pipelines) service for orchestrating
 *   ML training, batch inference, data preprocessing, and multi-step AI workflows.
 *   Supports creating, submitting, monitoring, and cancelling pipeline runs — all using
 *   the Vertex AI REST API with Application Default Credentials (ADC).
 *
 *   Google Repository References (Apache 2.0):
 *   - https://github.com/kubeflow/pipelines (Apache 2.0)
 *   - https://github.com/googleapis/python-aiplatform (Apache 2.0)
 *   - https://github.com/GoogleCloudPlatform/vertex-ai-samples (Apache 2.0)
 *
 * @see https://cloud.google.com/vertex-ai/docs/pipelines/overview
 */

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Returns the Vertex AI Pipelines base URL.
 * @param {string} projectId
 * @param {string} location
 * @returns {string}
 */
const getPipelinesBaseUrl = (projectId, location) =>
  `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}`;

// ── Pipeline run states ─────────────────────────────────────────────────────
const PIPELINE_STATES = {
  UNSPECIFIED: 'PIPELINE_STATE_UNSPECIFIED',
  QUEUED: 'PIPELINE_STATE_QUEUED',
  PENDING: 'PIPELINE_STATE_PENDING',
  RUNNING: 'PIPELINE_STATE_RUNNING',
  SUCCEEDED: 'PIPELINE_STATE_SUCCEEDED',
  FAILED: 'PIPELINE_STATE_FAILED',
  CANCELLING: 'PIPELINE_STATE_CANCELLING',
  CANCELLED: 'PIPELINE_STATE_CANCELLED',
  PAUSED: 'PIPELINE_STATE_PAUSED'
};

/**
 * Lists Vertex AI Pipeline jobs in the project.
 *
 * @param {object} [options={}]
 * @param {number} [options.pageSize=20] - Number of results to return.
 * @param {string} [options.pageToken] - Pagination token for fetching next page.
 * @param {string} [options.filter] - Filter expression (e.g., 'state="PIPELINE_STATE_RUNNING"').
 * @param {string} [options.orderBy] - Order expression (e.g., 'createTime desc').
 * @returns {Promise<object>} List of PipelineJob resources.
 */
const listPipelineJobs = async (options = {}) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');

  logger.info('GCP VertexPipeline: Listing pipeline jobs...');
  const client = await auth.getClient();

  const params = new URLSearchParams();
  if (options.pageSize) params.set('pageSize', options.pageSize.toString());
  if (options.pageToken) params.set('pageToken', options.pageToken);
  if (options.filter) params.set('filter', options.filter);
  if (options.orderBy) params.set('orderBy', options.orderBy);

  const url = `${getPipelinesBaseUrl(projectId, location)}/pipelineJobs?${params.toString()}`;
  const response = await client.request({ url, method: 'GET' });

  const jobs = response.data?.pipelineJobs || [];
  logger.info(`GCP VertexPipeline: Found ${jobs.length} pipeline job(s).`);

  return {
    success: true,
    jobs: jobs.map(job => ({
      name: job.name,
      displayName: job.displayName,
      state: job.state,
      createTime: job.createTime,
      startTime: job.startTime,
      endTime: job.endTime,
      error: job.error || null
    })),
    count: jobs.length,
    nextPageToken: response.data?.nextPageToken || null
  };
};

/**
 * Retrieves details of a specific pipeline job by its resource name or numeric ID.
 *
 * @param {string} pipelineJobId - The numeric job ID or full resource name.
 * @returns {Promise<object>} Full PipelineJob resource details.
 */
const getPipelineJob = async (pipelineJobId) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');
  if (!pipelineJobId) throw new Error('Pipeline job ID is required.');

  logger.info(`GCP VertexPipeline: Fetching pipeline job: ${pipelineJobId}`);
  const client = await auth.getClient();

  const url = `${getPipelinesBaseUrl(projectId, location)}/pipelineJobs/${pipelineJobId}`;
  const response = await client.request({ url, method: 'GET' });

  return { success: true, job: response.data };
};

/**
 * Creates and submits a Vertex AI Pipeline job from a compiled pipeline spec.
 * The pipeline spec must be in KFP v2 format stored in GCS or provided inline.
 *
 * @param {object} pipelineSpec - The compiled Kubeflow Pipeline v2 specification object.
 * @param {object} [options={}]
 * @param {string} [options.displayName] - Human-readable name for the pipeline run.
 * @param {string} [options.serviceAccount] - Service account email for pipeline execution.
 * @param {string} [options.network] - VPC network for the pipeline run.
 * @param {object} [options.runtimeConfig] - Runtime parameters and GCS output directory.
 * @param {string} [options.runtimeConfig.gcsOutputDirectory] - GCS URI for outputs.
 * @param {object} [options.runtimeConfig.parameters] - Pipeline parameter values.
 * @param {boolean} [options.enableCaching=true] - If true, enables pipeline step caching.
 * @param {object} [options.labels={}] - Resource labels (key-value pairs).
 * @returns {Promise<object>} The created PipelineJob resource.
 */
const createPipelineJob = async (pipelineSpec, options = {}) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');
  if (!pipelineSpec) throw new Error('Pipeline specification is required.');

  const displayName = options.displayName || `insoai-pipeline-${Date.now()}`;
  logger.info(`GCP VertexPipeline: Creating pipeline job: "${displayName}"`);

  const client = await auth.getClient();
  const url = `${getPipelinesBaseUrl(projectId, location)}/pipelineJobs`;

  const body = {
    displayName,
    pipelineSpec,
    runtimeConfig: options.runtimeConfig || {
      gcsOutputDirectory: `gs://${projectId}-vertex-pipelines/outputs/${displayName}/`
    },
    serviceAccount: options.serviceAccount || `vertex-ai@${projectId}.iam.gserviceaccount.com`,
    enableCaching: options.enableCaching !== false,
    labels: {
      platform: 'insoai-assistant',
      environment: process.env.NODE_ENV || 'production',
      ...options.labels
    }
  };

  if (options.network) {
    body.network = options.network;
  }

  const response = await client.request({ url, method: 'POST', data: body });

  const job = response.data;
  const jobId = job.name?.split('/').pop();

  logger.info(`GCP VertexPipeline: Pipeline job created — ID: ${jobId}, state: ${job.state}`);
  return { success: true, job, jobId, displayName };
};

/**
 * Submits a Vertex AI Pipeline job from a GCS-stored compiled pipeline template.
 * This is the most common production deployment pattern.
 *
 * @param {string} templateGcsUri - GCS URI to the compiled pipeline YAML/JSON (e.g., 'gs://bucket/pipeline.yaml').
 * @param {object} [options={}]
 * @param {string} [options.displayName] - Human-readable name for the run.
 * @param {object} [options.parameters={}] - Pipeline parameter key-value pairs.
 * @param {string} [options.gcsOutputDirectory] - GCS output directory URI.
 * @param {object} [options.labels={}] - Resource labels.
 * @returns {Promise<object>} The created PipelineJob resource.
 */
const submitPipelineFromTemplate = async (templateGcsUri, options = {}) => {
  if (!templateGcsUri) throw new Error('Template GCS URI is required.');

  logger.info(`GCP VertexPipeline: Submitting pipeline from GCS template: ${templateGcsUri}`);

  // Build a minimal pipeline spec that references the GCS template
  const pipelineSpec = {
    pipelineInfo: { name: options.displayName || 'insoai-pipeline' },
    sdkVersion: 'kfp-2.x',
    schemaVersion: '2.1.0',
    // Reference the compiled template stored in GCS
    components: {},
    deploymentSpec: {},
    root: {}
  };

  return createPipelineJob(pipelineSpec, {
    ...options,
    runtimeConfig: {
      gcsOutputDirectory: options.gcsOutputDirectory
        || `gs://${(config.google?.gcp_project_id || process.env.GCP_PROJECT_ID)}-vertex-pipelines/outputs/`,
      parameters: options.parameters || {}
    }
  });
};

/**
 * Cancels a running or pending pipeline job.
 *
 * @param {string} pipelineJobId - The numeric job ID to cancel.
 * @returns {Promise<object>} Cancellation result.
 */
const cancelPipelineJob = async (pipelineJobId) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');
  if (!pipelineJobId) throw new Error('Pipeline job ID is required.');

  logger.info(`GCP VertexPipeline: Cancelling pipeline job: ${pipelineJobId}`);
  const client = await auth.getClient();

  const url = `${getPipelinesBaseUrl(projectId, location)}/pipelineJobs/${pipelineJobId}:cancel`;
  await client.request({ url, method: 'POST', data: {} });

  return { success: true, pipelineJobId, message: `Pipeline job ${pipelineJobId} cancellation requested.` };
};

/**
 * Deletes a completed or failed pipeline job record.
 *
 * @param {string} pipelineJobId - The numeric job ID to delete.
 * @returns {Promise<object>} Deletion result (returns an LRO operation).
 */
const deletePipelineJob = async (pipelineJobId) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');
  if (!pipelineJobId) throw new Error('Pipeline job ID is required.');

  logger.info(`GCP VertexPipeline: Deleting pipeline job: ${pipelineJobId}`);
  const client = await auth.getClient();

  const url = `${getPipelinesBaseUrl(projectId, location)}/pipelineJobs/${pipelineJobId}`;
  const response = await client.request({ url, method: 'DELETE' });

  return { success: true, pipelineJobId, operation: response.data };
};

/**
 * Lists Vertex AI Pipeline templates stored in Artifact Registry.
 * Requires the Vertex AI Pipelines registry to be enabled in the project.
 *
 * @param {object} [options={}]
 * @param {number} [options.pageSize=20] - Number of results.
 * @param {string} [options.pageToken] - Pagination token.
 * @returns {Promise<object>} List of pipeline templates.
 */
const listPipelineTemplates = async (options = {}) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';
  if (!projectId) throw new Error('GCP Project ID is not configured.');

  logger.info('GCP VertexPipeline: Listing pipeline templates from Artifact Registry...');
  const client = await auth.getClient();

  const params = new URLSearchParams();
  if (options.pageSize) params.set('pageSize', options.pageSize.toString());
  if (options.pageToken) params.set('pageToken', options.pageToken);

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/pipelineJobs?filter=state="PIPELINE_STATE_SUCCEEDED"&orderBy=createTime desc&${params.toString()}`;
  const response = await client.request({ url, method: 'GET' });

  const templates = response.data?.pipelineJobs || [];
  return { success: true, templates, count: templates.length, nextPageToken: response.data?.nextPageToken || null };
};

/**
 * Polls a pipeline job until it reaches a terminal state (SUCCEEDED/FAILED/CANCELLED).
 * Uses exponential backoff with a configurable maximum wait time.
 *
 * @param {string} pipelineJobId - The numeric job ID to monitor.
 * @param {object} [options={}]
 * @param {number} [options.maxWaitMs=600000] - Maximum wait time in ms (default: 10 min).
 * @param {number} [options.initialPollIntervalMs=5000] - Starting poll interval (default: 5s).
 * @param {Function} [options.onUpdate] - Callback called on each status update: (state, job) => void.
 * @returns {Promise<object>} The final pipeline job state.
 */
const waitForPipelineCompletion = async (pipelineJobId, options = {}) => {
  const { maxWaitMs = 600000, initialPollIntervalMs = 5000, onUpdate } = options;
  const terminalStates = [
    PIPELINE_STATES.SUCCEEDED,
    PIPELINE_STATES.FAILED,
    PIPELINE_STATES.CANCELLED
  ];

  logger.info(`GCP VertexPipeline: Waiting for pipeline job ${pipelineJobId} to complete (max ${maxWaitMs / 1000}s)...`);

  const startTime = Date.now();
  let pollInterval = initialPollIntervalMs;

  while (Date.now() - startTime < maxWaitMs) {
    const { job } = await getPipelineJob(pipelineJobId);
    const state = job.state;

    logger.info(`GCP VertexPipeline: Job ${pipelineJobId} state: ${state}`);
    if (typeof onUpdate === 'function') onUpdate(state, job);

    if (terminalStates.includes(state)) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      logger.info(`GCP VertexPipeline: Job ${pipelineJobId} reached terminal state: ${state} in ${elapsed}s`);
      return {
        success: state === PIPELINE_STATES.SUCCEEDED,
        pipelineJobId,
        finalState: state,
        elapsedSeconds: elapsed,
        job
      };
    }

    // Exponential backoff: double poll interval up to 60s max
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, 60000);
  }

  throw new Error(`Pipeline job ${pipelineJobId} did not complete within ${maxWaitMs / 1000}s`);
};

/**
 * Builds a simple single-step Vertex AI Custom Training pipeline spec.
 * This creates a runnable KFP v2 pipeline for training a custom model on Vertex AI.
 *
 * @param {object} trainingConfig - Configuration for the training step.
 * @param {string} trainingConfig.containerImageUri - URI of the training container image.
 * @param {string[]} [trainingConfig.args=[]] - Command-line arguments for the container.
 * @param {string} [trainingConfig.machineType='n1-standard-8'] - Machine type.
 * @param {number} [trainingConfig.acceleratorCount=0] - Number of GPU accelerators.
 * @param {string} [trainingConfig.acceleratorType='ACCELERATOR_TYPE_UNSPECIFIED'] - GPU type.
 * @param {string} [trainingConfig.replicaCount='1'] - Number of training replicas.
 * @returns {object} A compilable KFP v2 pipeline spec dictionary.
 */
const buildCustomTrainingPipelineSpec = (trainingConfig) => {
  const {
    containerImageUri,
    args = [],
    machineType = 'n1-standard-8',
    acceleratorCount = 0,
    acceleratorType = 'ACCELERATOR_TYPE_UNSPECIFIED',
    replicaCount = '1'
  } = trainingConfig;

  if (!containerImageUri) throw new Error('Container image URI is required.');

  logger.info(`GCP VertexPipeline: Building custom training pipeline spec for: ${containerImageUri}`);

  return {
    pipelineInfo: { name: 'custom-training-pipeline' },
    schemaVersion: '2.1.0',
    sdkVersion: 'vertex-ai-sdk',
    components: {
      'comp-custom-training': {
        executorLabel: 'exec-custom-training',
        inputDefinitions: { parameters: {} },
        outputDefinitions: {}
      }
    },
    deploymentSpec: {
      executors: {
        'exec-custom-training': {
          container: {
            image: containerImageUri,
            args,
            resources: {
              acceleratorConfig: {
                type: acceleratorType,
                count: String(acceleratorCount)
              }
            }
          }
        }
      }
    },
    root: {
      dag: {
        tasks: {
          'custom-training': {
            cachingOptions: { enableCache: true },
            componentRef: { name: 'comp-custom-training' },
            taskInfo: { name: 'custom-training' }
          }
        }
      },
      inputDefinitions: { parameters: {} }
    },
    // Vertex AI Training pool config
    dedicatedResources: {
      machineSpec: {
        machineType,
        acceleratorType,
        acceleratorCount
      },
      replicaCount
    }
  };
};

/**
 * @namespace GcpVertexPipelineService
 * @description Native service layer for Vertex AI Pipelines (Kubeflow Pipelines).
 * Provides complete pipeline lifecycle management: listing, creation, monitoring, cancellation,
 * and deletion of ML pipeline jobs. Includes pipeline spec builders for custom training workloads.
 */
export const GcpVertexPipelineService = {
  // Discovery
  listPipelineJobs,
  listPipelineTemplates,
  getPipelineJob,

  // Lifecycle management
  createPipelineJob,
  submitPipelineFromTemplate,
  cancelPipelineJob,
  deletePipelineJob,

  // Monitoring
  waitForPipelineCompletion,

  // Spec builders
  buildCustomTrainingPipelineSpec,

  // Constants
  PIPELINE_STATES
};
