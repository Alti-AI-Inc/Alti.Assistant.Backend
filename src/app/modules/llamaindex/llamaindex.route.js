import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import { LlamaIndexController } from './llamaindex.controller.js';

const router = express.Router();

// All LlamaIndex routes require authentication
router.use(auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER));

/**
 * @swagger
 * /api/v1/llamaindex/collections/{collectionId}/documents:
 *   post:
 *     summary: Ingest a document into a collection
 *     tags: [LlamaIndex]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *               metadata:
 *                 type: object
 *               type:
 *                 type: string
 *                 enum: [text, pdf, html, markdown]
 *     responses:
 *       201:
 *         description: Document ingested
 */
router.post('/collections/:collectionId/documents', LlamaIndexController.ingestDocument);

/**
 * @swagger
 * /api/v1/llamaindex/collections/{collectionId}/query:
 *   post:
 *     summary: Query a collection using RAG
 *     tags: [LlamaIndex]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query:
 *                 type: string
 *               topK:
 *                 type: integer
 *                 default: 5
 *     responses:
 *       200:
 *         description: Query results with synthesized answer
 */
router.post('/collections/:collectionId/query', LlamaIndexController.queryCollection);

/**
 * @swagger
 * /api/v1/llamaindex/collections/{collectionId}/documents:
 *   get:
 *     summary: List documents in a collection
 *     tags: [LlamaIndex]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document list
 */
router.get('/collections/:collectionId/documents', LlamaIndexController.listDocuments);

/**
 * @swagger
 * /api/v1/llamaindex/collections/{collectionId}/documents/{documentId}:
 *   delete:
 *     summary: Delete a document
 *     tags: [LlamaIndex]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Document deleted
 */
router.delete('/collections/:collectionId/documents/:documentId', LlamaIndexController.deleteDocument);

/**
 * @swagger
 * /api/v1/llamaindex/collections/{collectionId}/stats:
 *   get:
 *     summary: Get collection statistics
 *     tags: [LlamaIndex]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Collection stats
 */
router.get('/collections/:collectionId/stats', LlamaIndexController.getCollectionStats);

export const LlamaIndexRoutes = router;
export default router;
