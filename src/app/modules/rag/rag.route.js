import express from 'express';
import multer from 'multer';
import path from 'path';
import auth from '../../middlewares/auth/auth.js';
import { RagController } from './rag.controller.js';

const router = express.Router();

// File upload middleware for document ingestion
const storage = multer.diskStorage({
  destination: 'uploads/rag_temp',
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `rag-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const ragUploader = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.txt', '.md', '.csv', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Supported: ${allowed.join(', ')}`));
    }
  },
});

// ── Public ──────────────────────────────────────────────────────────────────
router.get('/embeddings/models', RagController.embeddingModels);

// ── Authenticated ───────────────────────────────────────────────────────────
router.use(auth());

// Initialize vector store (run once or on demand)
router.post('/initialize', RagController.initialize);

// Collections
router.post('/collections', RagController.createCollection);
router.get('/collections', RagController.listCollections);
router.delete('/collections/:collectionId', RagController.deleteCollection);

// Document management
router.get('/collections/:collectionId/documents', RagController.listDocuments);
router.get('/documents/:documentId', RagController.getDocument);
router.delete('/documents/:documentId', RagController.deleteDocument);

// Ingestion
router.post('/ingest/text', RagController.ingestText);
router.post('/ingest/url', RagController.ingestUrl);
router.post('/ingest/file', ragUploader.single('file'), RagController.ingestFile);

// Retrieval & Query
router.post('/retrieve', RagController.retrieve);
router.post('/query', RagController.queryRag);
router.post('/query/stream', RagController.queryStream);

// Embeddings
router.post('/embed', RagController.embed);

export const RagRoutes = router;
export default RagRoutes;
