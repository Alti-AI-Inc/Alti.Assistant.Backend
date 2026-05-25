import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import ApiError from '../../../errors/ApiError.js';
import { GcpNativeService } from './gcp-native.service.js';
import { GcpDocumentAiService } from './gcp-document-ai.service.js';
import { GcpVertexGroundingService } from './gcp-vertex-grounding.service.js';
import { GcpVisionService } from './gcp-vision.service.js';
import { GcpSpeechService } from './gcp-speech.service.js';
import { GcpWorkspaceService } from './gcp-workspace.service.js';
import { GcpNlpService } from './gcp-nlp.service.js';
import { GcpVideoIntelService } from './gcp-video-intel.service.js';
import { GcpEmbeddingsService } from './gcp-embeddings.service.js';
import { GcpTranslateAdvancedService } from './gcp-translate-advanced.service.js';
import { GcpStorageService } from './gcp-storage.service.js';
import { GcpBigqueryService } from './gcp-bigquery.service.js';
import { GcpSecretsService } from './gcp-secrets.service.js';
import { GcpPubSubService } from './gcp-pubsub.service.js';
import { GcpMapsService } from './gcp-maps.service.js';
import { GcpBusinessService } from './gcp-business.service.js';
import { GcpLoggingService } from './gcp-logging.service.js';
import { GcpErrorsService } from './gcp-errors.service.js';
import { GcpRecaptchaService } from './gcp-recaptcha.service.js';
import { GcpSearchAggregatorService } from './gcp-search-aggregator.service.js';
import { GcpKnowledgeGraphService } from './gcp-knowledge-graph.service.js';
import { GcpTasksService } from './gcp-tasks.service.js';
import { GcpSafeBrowsingService } from './gcp-safe-browsing.service.js';
import { GcpFontsService } from './gcp-fonts.service.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';

const searchCatalog = catchAsync(async (req, res) => {
  const { query, license, language, sortBy, limit, page } = req.query;

  const result = await GcpNativeService.searchGcpCatalog(query, {
    license,
    language,
    sortBy,
    limit,
    page
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'GCP Repository Catalog queried successfully.',
    data: result
  });
});

const importSubmodule = catchAsync(async (req, res) => {
  const { repoName } = req.body;

  const result = await GcpNativeService.importGcpSubmodule(repoName);

  sendResponse(res, {
    statusCode: result.success ? httpStatus.OK : httpStatus.BAD_REQUEST,
    success: result.success,
    message: result.message,
    data: result
  });
});

/**
 * Handles Google Search Grounded Chat generation requests.
 */
const groundedChat = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } = await validatePromptRequest(req);

  const result = await GcpVertexGroundingService.groundedPromptResponse(
    sessionId,
    prompt,
    userId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Grounded response generated successfully.',
    data: result,
  });
});

/**
 * Handles Document AI file ingestion requests.
 */
const processDocumentFile = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please upload a document file to process.');
  }

  const { processorId, location } = req.body;
  const fileBuffer = req.file.buffer;
  const mimeType = req.file.mimetype;

  const result = await GcpDocumentAiService.processDocument(
    fileBuffer,
    mimeType,
    processorId,
    location
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Document processed successfully via GCP Document AI.',
    data: result,
  });
});

/**
 * Handles Image Analysis via Google Cloud Vision.
 */
const analyzeImageFile = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please upload an image file to analyze.');
  }

  const { features } = req.body;
  const parsedFeatures = features ? (typeof features === 'string' ? JSON.parse(features) : features) : undefined;
  const fileBuffer = req.file.buffer;

  const result = await GcpVisionService.analyzeImage(fileBuffer, parsedFeatures);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Image analyzed successfully via Google Cloud Vision.',
    data: result,
  });
});

/**
 * Handles Text-to-Speech synthesis.
 */
const textToSpeech = catchAsync(async (req, res) => {
  const { text, options } = req.body;
  if (!text) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "text" is missing.');
  }

  const result = await GcpSpeechService.synthesizeSpeech(text, options);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Speech synthesized successfully via Google Cloud Text-to-Speech.',
    data: result,
  });
});

/**
 * Handles Speech-to-Text transcription.
 */
const speechToTextFile = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please upload an audio file to transcribe.');
  }

  const { languageCode, encoding, sampleRateHertz } = req.body;
  const fileBuffer = req.file.buffer;

  const result = await GcpSpeechService.transcribeSpeech(fileBuffer, {
    languageCode,
    encoding,
    sampleRateHertz: sampleRateHertz ? parseInt(sampleRateHertz) : undefined
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Audio transcribed successfully via Google Cloud Speech-to-Text.',
    data: result,
  });
});

/**
 * Handles Natural Language text analysis.
 */
const analyzeTextNlp = catchAsync(async (req, res) => {
  const { text, operations } = req.body;
  if (!text) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "text" is missing.');
  }

  const result = await GcpNlpService.analyzeText(text, operations);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Text analyzed successfully via Google Cloud Natural Language API.',
    data: result,
  });
});

/**
 * Handles Google Drive file uploads.
 */
const driveUploadFile = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please upload a file to send to Google Drive.');
  }

  const { folderId } = req.body;
  const fileBuffer = req.file.buffer;
  const fileName = req.file.originalname;
  const mimeType = req.file.mimetype;

  const result = await GcpWorkspaceService.driveUpload(
    fileName,
    fileBuffer,
    folderId,
    mimeType
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'File successfully uploaded to Google Drive.',
    data: result,
  });
});

/**
 * Handles Google Drive downloads.
 */
const driveDownloadFile = catchAsync(async (req, res) => {
  const { fileId } = req.params;
  if (!fileId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "fileId" is missing.');
  }

  const result = await GcpWorkspaceService.driveDownload(fileId);

  // Set standard file download headers dynamically
  res.setHeader('Content-Disposition', `attachment; filename=drive_file_${fileId}`);
  res.status(httpStatus.OK).send(result.content);
});

/**
 * Handles spreadsheet creation.
 */
const createSpreadsheet = catchAsync(async (req, res) => {
  const { title } = req.body;
  if (!title) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "title" is missing.');
  }

  const result = await GcpWorkspaceService.sheetsCreate(title);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Google Spreadsheet created successfully.',
    data: result,
  });
});

/**
 * Handles row appends in Google Sheets.
 */
const appendSpreadsheetRow = catchAsync(async (req, res) => {
  const { spreadsheetId, range, values } = req.body;
  if (!spreadsheetId || !range || !values) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "spreadsheetId", "range", and "values" are required.');
  }

  const result = await GcpWorkspaceService.sheetsAppend(spreadsheetId, range, values);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Row successfully appended to Google Spreadsheet.',
    data: result,
  });
});

/**
 * Handles reading spreadsheet cells.
 */
const readSpreadsheetRange = catchAsync(async (req, res) => {
  const { spreadsheetId, range } = req.query;
  if (!spreadsheetId || !range) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Query parameters "spreadsheetId" and "range" are required.');
  }

  const result = await GcpWorkspaceService.sheetsRead(spreadsheetId, range);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Cell values successfully retrieved from Google Spreadsheet.',
    data: result,
  });
});

/**
 * Handles creating formatted Google Documents.
 */
const createDocFile = catchAsync(async (req, res) => {
  const { title, bodyText } = req.body;
  if (!title || !bodyText) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "title" and "bodyText" are required.');
  }

  const result = await GcpWorkspaceService.docsCreate(title, bodyText);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Google Document created successfully.',
    data: result,
  });
});

/**
 * Handles calendar event creation.
 */
const createCalendarEvent = catchAsync(async (req, res) => {
  const { summary, startTime, endTime, details } = req.body;
  if (!summary || !startTime || !endTime) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "summary", "startTime", and "endTime" are required.');
  }

  const result = await GcpWorkspaceService.calendarCreateEvent(
    summary,
    startTime,
    endTime,
    details
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Calendar Event created successfully.',
    data: result,
  });
});

/**
 * Handles listing calendar events.
 */
const listCalendarEvents = catchAsync(async (req, res) => {
  const { calendarId, maxResults, timeMin } = req.query;

  const result = await GcpWorkspaceService.calendarListEvents({
    calendarId,
    maxResults: maxResults ? parseInt(maxResults) : undefined,
    timeMin
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Calendar Events retrieved successfully.',
    data: result,
  });
});

// ── Phase 2: Video Intelligence ─────────────────────────────────────────────

/**
 * Handles premium video analysis requests.
 */
const analyzeVideoFile = catchAsync(async (req, res) => {
  const { inputUri, features } = req.body;
  const parsedFeatures = features ? (typeof features === 'string' ? JSON.parse(features) : features) : undefined;
  
  let result;
  if (req.file) {
    result = await GcpVideoIntelService.startVideoAnalysis(null, req.file.buffer, parsedFeatures);
  } else if (inputUri) {
    result = await GcpVideoIntelService.startVideoAnalysis(inputUri, null, parsedFeatures);
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Either upload a video file or provide a GCS inputUri.');
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Video analysis operation successfully started.',
    data: result,
  });
});

/**
 * Handles querying status of a running video analysis operation.
 */
const getVideoAnalysisStatus = catchAsync(async (req, res) => {
  const { operationName } = req.params;
  if (!operationName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "operationName" is missing.');
  }

  const result = await GcpVideoIntelService.checkVideoAnalysisStatus(operationName);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Video analysis operation status retrieved.',
    data: result,
  });
});

// ── Phase 2: Vertex AI Embeddings ───────────────────────────────────────────

/**
 * Handles text and multimodal vector embedding requests.
 */
const getEmbeddings = catchAsync(async (req, res) => {
  const { text, type, taskType } = req.body;

  let result;
  if (type === 'multimodal') {
    const imageBuffer = req.file ? req.file.buffer : null;
    result = await GcpEmbeddingsService.getMultimodalEmbeddings(text, imageBuffer);
  } else {
    if (!text) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "text" is missing for text embedding.');
    }
    result = await GcpEmbeddingsService.getTextEmbeddings(text, taskType);
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Vector embeddings generated successfully.',
    data: result,
  });
});

// ── Phase 2: Advanced Translation ───────────────────────────────────────────

/**
 * Handles advanced language detection requests.
 */
const detectLanguage = catchAsync(async (req, res) => {
  const { text } = req.body;
  if (!text) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "text" is missing.');
  }

  const result = await GcpTranslateAdvancedService.detectTextLanguage(text);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Language detected successfully.',
    data: result,
  });
});

/**
 * Handles formatted document translation.
 */
const translateDocumentFile = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please upload a document to translate.');
  }

  const { targetLanguageCode, sourceLanguageCode } = req.body;
  if (!targetLanguageCode) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "targetLanguageCode" is missing.');
  }

  const result = await GcpTranslateAdvancedService.translateDocument(
    req.file.buffer,
    req.file.mimetype,
    targetLanguageCode,
    sourceLanguageCode
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Document successfully translated while preserving layout.',
    data: result,
  });
});

// ── Phase 3: GCS Storage bucket actions ──────────────────────────────────────

/**
 * Handles storage bucket creation.
 */
const storageCreateBucket = catchAsync(async (req, res) => {
  const { bucketName, location } = req.body;
  if (!bucketName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "bucketName" is missing.');
  }

  const result = await GcpStorageService.createBucket(bucketName, location);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Google Cloud Storage bucket successfully created.',
    data: result,
  });
});

/**
 * Handles pre-signed GCS URL generation.
 */
const storageSignedUrl = catchAsync(async (req, res) => {
  const { bucketName, fileName, action, expiresMinutes } = req.body;
  if (!bucketName || !fileName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "bucketName" and "fileName" are required.');
  }

  const result = await GcpStorageService.generateSignedUrl(
    bucketName,
    fileName,
    action,
    expiresMinutes ? parseInt(expiresMinutes) : undefined
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Pre-signed storage URL generated successfully.',
    data: result,
  });
});

/**
 * Handles listing files within GCS buckets.
 */
const storageListFiles = catchAsync(async (req, res) => {
  const { bucketName, prefix } = req.query;
  if (!bucketName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Query parameter "bucketName" is required.');
  }

  const result = await GcpStorageService.listFiles(bucketName, prefix);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'GCS bucket files listed successfully.',
    data: result,
  });
});

// ── Phase 3: BigQuery CRUD Data actions ─────────────────────────────────────

/**
 * Handles dataset creation.
 */
const bqCreateDataset = catchAsync(async (req, res) => {
  const { datasetId, location } = req.body;
  if (!datasetId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "datasetId" is missing.');
  }

  const result = await GcpBigqueryService.createDataset(datasetId, location);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'BigQuery Dataset successfully created.',
    data: result,
  });
});

/**
 * Handles table creation in datasets.
 */
const bqCreateTable = catchAsync(async (req, res) => {
  const { datasetId, tableId, fields } = req.body;
  if (!datasetId || !tableId || !fields) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "datasetId", "tableId", and "fields" are required.');
  }

  const result = await GcpBigqueryService.createTable(datasetId, tableId, fields);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'BigQuery Table created successfully with schema mapping.',
    data: result,
  });
});

/**
 * Handles importing GCS CSV files into BigQuery.
 */
const bqLoadCsv = catchAsync(async (req, res) => {
  const { datasetId, tableId, gcsUri } = req.body;
  if (!datasetId || !tableId || !gcsUri) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "datasetId", "tableId", and "gcsUri" are required.');
  }

  const result = await GcpBigqueryService.loadCsvFromGcs(datasetId, tableId, gcsUri);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'BigQuery CSV Ingestion job submitted successfully.',
    data: result,
  });
});

// ── Phase 3: Google Secret Manager ──────────────────────────────────────────

/**
 * Handles retrieving secrets.
 */
const getSecret = catchAsync(async (req, res) => {
  const { secretId } = req.params;
  if (!secretId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "secretId" is missing.');
  }

  const result = await GcpSecretsService.getSecretValue(secretId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Secret payload successfully accessed.',
    data: result,
  });
});

/**
 * Handles creating and versioning secrets.
 */
const createSecret = catchAsync(async (req, res) => {
  const { secretId, value } = req.body;
  if (!secretId || !value) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "secretId" and "value" are required.');
  }

  const result = await GcpSecretsService.createSecretValue(secretId, value);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Secret version successfully added.',
    data: result,
  });
});

// ── Phase 3: Google Cloud Pub/Sub ───────────────────────────────────────────

/**
 * Handles Pub/Sub Topic creation.
 */
const pubsubCreateTopic = catchAsync(async (req, res) => {
  const { topicId } = req.body;
  if (!topicId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "topicId" is missing.');
  }

  const result = await GcpPubSubService.createTopic(topicId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Pub/Sub Topic successfully created.',
    data: result,
  });
});

/**
 * Handles message publishing to a topic.
 */
const pubsubPublishMessage = catchAsync(async (req, res) => {
  const { topicId, data } = req.body;
  if (!topicId || !data) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "topicId" and "data" (JSON object) are required.');
  }

  const result = await GcpPubSubService.publishMessage(topicId, data);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Message successfully published to Pub/Sub Topic.',
    data: result,
  });
});

/**
 * Handles Subscription mapping to Topics.
 */
const pubsubCreateSubscription = catchAsync(async (req, res) => {
  const { topicId, subscriptionId, pushEndpoint } = req.body;
  if (!topicId || !subscriptionId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "topicId" and "subscriptionId" are required.');
  }

  const result = await GcpPubSubService.createSubscription(topicId, subscriptionId, pushEndpoint);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Pub/Sub Subscription successfully created.',
    data: result,
  });
});

// ── Phase 4: Google Maps Platform ──────────────────────────────────────────

/**
 * Handles Geocoding addresses to geocoordinates.
 */
const mapsGeocode = catchAsync(async (req, res) => {
  const { address } = req.body;
  if (!address) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "address" is missing.');
  }

  const result = await GcpMapsService.geocodeAddress(address);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Address geocoded successfully.',
    data: result,
  });
});

/**
 * Handles nearby search query routing.
 */
const mapsPlaces = catchAsync(async (req, res) => {
  const { latitude, longitude, radius, keyword } = req.body;
  if (latitude === undefined || longitude === undefined) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameters "latitude" and "longitude" are missing.');
  }

  const result = await GcpMapsService.searchNearbyPlaces(
    parseFloat(latitude),
    parseFloat(longitude),
    radius ? parseInt(radius) : undefined,
    keyword
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Nearby places queried successfully.',
    data: result,
  });
});

/**
 * Handles turn-by-turn routing calculation.
 */
const mapsDirections = catchAsync(async (req, res) => {
  const { origin, destination, mode } = req.body;
  if (!origin || !destination) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "origin" and "destination" are required.');
  }

  const result = await GcpMapsService.calculateRoute(origin, destination, mode);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Route directions calculated successfully.',
    data: result,
  });
});

// ── Phase 5: Location Details, Reviews & Google Business ────────────────────

/**
 * Handles Place Details querying.
 */
const mapsPlaceDetails = catchAsync(async (req, res) => {
  const { placeId } = req.body;
  if (!placeId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "placeId" is missing.');
  }

  const result = await GcpMapsService.getPlaceDetails(placeId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Place Details retrieved successfully.',
    data: result,
  });
});

/**
 * Handles Place Photo URL generation.
 */
const mapsPlacePhoto = catchAsync(async (req, res) => {
  const { photoReference } = req.params;
  const { maxWidth } = req.query;

  const result = GcpMapsService.getPlacePhotoUrl(
    photoReference,
    maxWidth ? parseInt(maxWidth) : undefined
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Place Photo URL generated successfully.',
    data: result,
  });
});

/**
 * Handles listing My Business profile locations.
 */
const businessListLocations = catchAsync(async (req, res) => {
  const { accountId } = req.body;
  if (!accountId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "accountId" is missing.');
  }

  const result = await GcpBusinessService.listBusinessLocations(accountId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Business locations retrieved successfully.',
    data: result,
  });
});

/**
 * Handles listing reviews and ratings for a location.
 */
const businessListReviews = catchAsync(async (req, res) => {
  const { accountId, locationId } = req.body;
  if (!accountId || !locationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "accountId" and "locationId" are required.');
  }

  const result = await GcpBusinessService.listLocationReviews(accountId, locationId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Location customer reviews retrieved successfully.',
    data: result,
  });
});

/**
 * Handles publishing update posts to Google Search & Maps.
 */
const businessCreatePost = catchAsync(async (req, res) => {
  const { accountId, locationId, postPayload } = req.body;
  if (!accountId || !locationId || !postPayload) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "accountId", "locationId", and "postPayload" are required.');
  }

  const result = await GcpBusinessService.createLocalPost(accountId, locationId, postPayload);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Local business update post published successfully.',
    data: result,
  });
});

/**
 * Handles cognitive unified business intelligence querying.
 */
const businessUnifiedAnalytics = catchAsync(async (req, res) => {
  const { query } = req.body;
  if (!query) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "query" (name or address) is missing.');
  }

  const result = await GcpBusinessService.getUnifiedBusinessIntelligence(query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Unified Business Analytics intelligence generated successfully.',
    data: result,
  });
});

// ── Phase 6: Cloud Observability & Security ────────────────────────────────

/**
 * Handles Stackdriver structured log dispatches.
 */
const observabilityWriteLog = catchAsync(async (req, res) => {
  const { logName, message, severity, labels } = req.body;
  if (!logName || !message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parameters "logName" and "message" are required.');
  }

  const result = await GcpLoggingService.writeLogEntry(logName, message, severity, labels);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Structured entry successfully written to Google Cloud Logging.',
    data: result,
  });
});

/**
 * Handles Stackdriver error dispatches.
 */
const observabilityReportError = catchAsync(async (req, res) => {
  const { errorMessage, stackTrace, user, serviceName } = req.body;
  if (!errorMessage) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "errorMessage" is missing.');
  }

  const result = await GcpErrorsService.reportError(errorMessage, stackTrace, user, serviceName);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Error report successfully submitted to Cloud Error Reporting.',
    data: result,
  });
});

/**
 * Handles reCAPTCHA Enterprise bot score assessments.
 */
const securityRecaptchaVerify = catchAsync(async (req, res) => {
  const { token, expectedAction, siteKey } = req.body;
  if (!token) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "token" is missing.');
  }

  const result = await GcpRecaptchaService.verifyRecaptchaToken(token, expectedAction, siteKey);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'reCAPTCHA token assessment evaluated successfully.',
    data: result,
  });
});

/**
 * Handles Advanced Google Web/Image Search Aggregation queries.
 */
const searchAdvanced = catchAsync(async (req, res) => {
  const { query, searchType, numResults, safe } = req.body;
  if (!query) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "query" is missing.');
  }

  const result = await GcpSearchAggregatorService.executeParallelSearch(query, searchType, numResults, safe);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Advanced parallelized Google search executed successfully.',
    data: result,
  });
});

/**
 * Handles Google Knowledge Graph structured entity lookups.
 */
const searchKnowledgeGraph = catchAsync(async (req, res) => {
  const { query, limit, types, languages } = req.body;
  if (!query) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "query" is missing.');
  }

  const result = await GcpKnowledgeGraphService.lookupEntity(query, limit, types, languages);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Google Knowledge Graph entity lookup executed successfully.',
    data: result,
  });
});

/**
 * Handles enqueuing delayed background HTTP tasks using Google Cloud Tasks.
 */
const tasksCreateHttp = catchAsync(async (req, res) => {
  const { queueName, url, payload, delaySeconds, headers } = req.body;
  if (!url) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "url" is missing.');
  }

  const result = await GcpTasksService.createHttpTask(queueName, url, payload, delaySeconds, headers);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Background HTTP task successfully scheduled in Google Cloud Tasks.',
    data: result,
  });
});

/**
 * Checks a URL against Google's Safe Browsing API lists for security threat evaluation.
 */
const securityCheckSafeBrowsing = catchAsync(async (req, res) => {
  const { url } = req.body;
  if (!url) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Required parameter "url" is missing.');
  }

  const result = await GcpSafeBrowsingService.lookupUrlSafety(url);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'URL Safe Browsing threat analysis evaluated successfully.',
    data: result,
  });
});

/**
 * Searches and retrieves premium web font definitions and asset URLs from the Google Fonts API.
 */
const designResolveFonts = catchAsync(async (req, res) => {
  const { filterQuery, sortBy, limit } = req.body;
  const result = await GcpFontsService.resolveGoogleFonts(filterQuery, sortBy, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Google Web Fonts resolved successfully.',
    data: result,
  });
});

export const GcpNativeController = {
  searchCatalog,
  importSubmodule,
  groundedChat,
  processDocumentFile,
  analyzeImageFile,
  textToSpeech,
  speechToTextFile,
  analyzeTextNlp,
  driveUploadFile,
  driveDownloadFile,
  createSpreadsheet,
  appendSpreadsheetRow,
  readSpreadsheetRange,
  createDocFile,
  createCalendarEvent,
  listCalendarEvents,
  analyzeVideoFile,
  getVideoAnalysisStatus,
  getEmbeddings,
  detectLanguage,
  translateDocumentFile,
  storageCreateBucket,
  storageSignedUrl,
  storageListFiles,
  bqCreateDataset,
  bqCreateTable,
  bqLoadCsv,
  getSecret,
  createSecret,
  pubsubCreateTopic,
  pubsubPublishMessage,
  pubsubCreateSubscription,
  mapsGeocode,
  mapsPlaces,
  mapsDirections,
  mapsPlaceDetails,
  mapsPlacePhoto,
  businessListLocations,
  businessListReviews,
  businessCreatePost,
  businessUnifiedAnalytics,
  observabilityWriteLog,
  observabilityReportError,
  securityRecaptchaVerify,
  searchAdvanced,
  searchKnowledgeGraph,
  tasksCreateHttp,
  securityCheckSafeBrowsing,
  designResolveFonts
};
