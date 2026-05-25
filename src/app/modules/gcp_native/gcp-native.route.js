import express from 'express';
import multer from 'multer';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { GcpNativeController } from './gcp-native.controller.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── Catalog & Admin Submodules ─────────────────────────────────────────────
router.get(
  '/search-catalog',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.searchCatalog
);

router.post(
  '/import',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.importSubmodule
);

// ── Gemini Vertex Grounding Chat ────────────────────────────────────────────
router.post(
  '/grounded-chat',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.groundedChat
);

// ── Document AI ─────────────────────────────────────────────────────────────
router.post(
  '/document-ai',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  upload.single('document'),
  GcpNativeController.processDocumentFile
);

// ── Vision API ──────────────────────────────────────────────────────────────
router.post(
  '/vision/analyze',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  upload.single('image'),
  GcpNativeController.analyzeImageFile
);

// ── Speech STT / TTS ────────────────────────────────────────────────────────
router.post(
  '/speech/text-to-speech',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.textToSpeech
);

router.post(
  '/speech/speech-to-text',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  upload.single('audio'),
  GcpNativeController.speechToTextFile
);

// ── Natural Language (NLP) ──────────────────────────────────────────────────
router.post(
  '/nlp/analyze',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.analyzeTextNlp
);

// ── Workspace Google Drive ──────────────────────────────────────────────────
router.post(
  '/workspace/drive/upload',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  upload.single('file'),
  GcpNativeController.driveUploadFile
);

router.get(
  '/workspace/drive/download/:fileId',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.driveDownloadFile
);

// ── Workspace Google Sheets ─────────────────────────────────────────────────
router.post(
  '/workspace/sheets/create',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.createSpreadsheet
);

router.post(
  '/workspace/sheets/append',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.appendSpreadsheetRow
);

router.get(
  '/workspace/sheets/read',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.readSpreadsheetRange
);

// ── Workspace Google Docs ───────────────────────────────────────────────────
router.post(
  '/workspace/docs/create',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.createDocFile
);

// ── Workspace Google Calendar ───────────────────────────────────────────────
router.post(
  '/workspace/calendar/create-event',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.createCalendarEvent
);

router.get(
  '/workspace/calendar/events',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.listCalendarEvents
);

// ── Phase 2: Video Intelligence ─────────────────────────────────────────────
router.post(
  '/video/analyze',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  upload.single('video'),
  GcpNativeController.analyzeVideoFile
);

router.get(
  '/video/status/:operationName',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.getVideoAnalysisStatus
);

// ── Phase 2: Vertex AI Embeddings ───────────────────────────────────────────
router.post(
  '/embeddings',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  upload.single('image'),
  GcpNativeController.getEmbeddings
);

// ── Phase 2: Advanced Translation ───────────────────────────────────────────
router.post(
  '/translate/detect',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.detectLanguage
);

router.post(
  '/translate/document',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  upload.single('document'),
  GcpNativeController.translateDocumentFile
);

// ── Phase 3: GCS Storage ────────────────────────────────────────────────────
router.post(
  '/storage/bucket',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.storageCreateBucket
);

router.post(
  '/storage/signed-url',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.storageSignedUrl
);

router.get(
  '/storage/files',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.storageListFiles
);

// ── Phase 3: BigQuery Analytics ─────────────────────────────────────────────
router.post(
  '/bigquery/dataset',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.bqCreateDataset
);

router.post(
  '/bigquery/table',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.bqCreateTable
);

router.post(
  '/bigquery/load-csv',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.bqLoadCsv
);

// ── Phase 3: Secret Manager ─────────────────────────────────────────────────
router.get(
  '/secrets/:secretId',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.getSecret
);

router.post(
  '/secrets',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.createSecret
);

// ── Phase 3: Pub/Sub Events ─────────────────────────────────────────────────
router.post(
  '/pubsub/topic',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.pubsubCreateTopic
);

router.post(
  '/pubsub/publish',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.pubsubPublishMessage
);

router.post(
  '/pubsub/subscription',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.pubsubCreateSubscription
);

// ── Phase 4: Google Maps Platform ──────────────────────────────────────────
router.post(
  '/maps/geocode',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.mapsGeocode
);

router.post(
  '/maps/places',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.mapsPlaces
);

router.post(
  '/maps/directions',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.mapsDirections
);

// ── Phase 5: Location Details, Reviews & Google Business ────────────────────
router.post(
  '/maps/place-details',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.mapsPlaceDetails
);

router.get(
  '/maps/place-photo/:photoReference',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.mapsPlacePhoto
);

router.post(
  '/business/locations',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.businessListLocations
);

router.post(
  '/business/reviews',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.businessListReviews
);

router.post(
  '/business/post',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.businessCreatePost
);

router.post(
  '/business/unified-analytics',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.businessUnifiedAnalytics
);

// ── Phase 6: Cloud Observability & Security ────────────────────────────────
router.post(
  '/observability/log',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.observabilityWriteLog
);

router.post(
  '/observability/error',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.observabilityReportError
);

// ── Phase 7: Advanced Search & Knowledge Intelligence ───────────────────────
router.post(
  '/search/advanced',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.searchAdvanced
);

// ── Phase 8: Distributed Tasks, Security & Design Intelligence ──────────────
router.post(
  '/tasks/create',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.tasksCreateHttp
);

router.post(
  '/security/safe-browsing',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.securityCheckSafeBrowsing
);

router.post(
  '/design/fonts',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  GcpNativeController.designResolveFonts
);

export const gcpNativeRoutes = router;
