import express from 'express';
// New imports for server lifecycle management
import http from 'http';

// Original imports from the route file
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { documentController } from './document.controller.js';
import { DocumentValidation } from './document.validation.js';

// --- Placeholder for Database Connection ---
// In a real application, this would be imported from a dedicated module.
const database = {
  connect: async () => {
    console.log('Connecting to the database...');
    // Simulate async connection
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('Database connection established.');
    return true;
  },
  close: async () => {
    console.log('Closing database connection...');
    await new Promise(resolve => setTimeout(resolve, 250));
    console.log('Database connection closed.');
  },
  // This function would check the actual connection status.
  isHealthy: () => true,
};
// --- End of Placeholder ---

const app = express();
// Add a JSON body parser for POST requests, which is a common requirement.
app.use(express.json());

// --- Cloud Run Health and Readiness Probes ---

// A state variable to track if the application is ready to serve traffic.
let isReady = false;

/**
 * Liveness probe endpoint (/healthz).
 * Cloud Run uses this to check if the container's main process is running.
 * If this fails, Cloud Run will restart the container.
 */
app.get('/healthz', (req, res) => {
  // This should always return 200 OK as long as the Express server is up.
  res.status(200).send('OK');
});

/**
 * Readiness probe endpoint (/readyz).
 * Cloud Run uses this to determine if the application is ready to accept new requests.
 * Traffic is only routed to instances that pass this check.
 */
app.get('/readyz', (req, res) => {
  // Check for essential dependencies like database connections.
  if (isReady && database.isHealthy()) {
    res.status(200).send('OK');
  } else {
    // If the app is not ready, return 503 to signal Cloud Run not to send traffic.
    res.status(503).send('Service Not Ready');
  }
});

// --- Application Routes (from original file) ---

/**
 * @constant {express.Router} router - Express router for document drafting routes.
 * Handles all API endpoints related to document generation, editing, and conversational assistance.
 */
const router = express.Router();

/**
 * @swagger
 * /api/v1/document-drafting/assistant:
 *   post:
 *     summary: Interact with the AI assistant for document drafting.
 *     description: |
 *       This endpoint allows users to interact with a conversational AI assistant to draft, refine,
 *       or generate documents based on natural language input. It supports both authenticated users
 *       and guests, with different rate limits and capabilities.
 *     tags:
 *       - Document Drafting
 *       - AI Assistant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The natural language prompt or query for the AI assistant.
 *                 example: "Draft a professional email to a client about project status update."
 *               context:
 *                 type: string
 *                 nullable: true
 *                 description: Optional context or previous conversation history to guide the AI.
 *                 example: "The client is John Doe from ABC Corp. The project is 'Website Redesign'."
 *               documentId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional ID of an existing document to continue working on.
 *                 example: "65e7b2a3c8d1e0f7a6b5c4d3"
 *             required:
 *               - prompt
 *     responses:
 *       200:
 *         description: Document drafting response from the AI assistant.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: The AI assistant's response, potentially including generated text or follow-up questions.
 *                   properties:
 *                     generatedText:
 *                       type: string
 *                       description: The text generated by the AI.
 *                       example: "Subject: Project Update - Website Redesign\n\nDear John,\n\n..."
 *                     documentId:
 *                       type: string
 *                       nullable: true
 *                       description: The ID of the document being drafted or updated.
 *                       example: "65e7b2a3c8d1e0f7a6b5c4d3"
 *                     followUpSuggestions:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Suggested follow-up prompts for the user.
 *                       example: ["Make it more formal", "Expand on the benefits", "Translate to Spanish"]
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext, // Extract tenant context after auth
  checkDailyRequestLimit,
  createRateLimiter(30, 15),
  validateRequest(DocumentValidation.conversationalRequestSchema),
  documentController.conversationalAssistant
);

/**
 * @swagger
 * /api/v1/document-drafting/generate:
 *   post:
 *     summary: Generate a document directly with specified parameters.
 *     description: |
 *       This endpoint allows for direct, non-conversational generation of documents.
 *       Users provide all necessary parameters upfront to generate a document without
 *       interactive prompts. Supports both authenticated users and guests.
 *     tags:
 *       - Document Drafting
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               documentType:
 *                 type: string
 *                 description: The type of document to generate (e.g., 'email', 'report', 'blog_post').
 *                 example: "email"
 *               parameters:
 *                 type: object
 *                 description: Key-value pairs of parameters specific to the document type.
 *                 example:
 *                   recipient: "John Doe"
 *                   subject: "Meeting Reminder"
 *                   body: "Just a friendly reminder about our meeting tomorrow at 10 AM."
 *               tone:
 *                 type: string
 *                 nullable: true
 *                 description: The desired tone of the document (e.g., 'formal', 'friendly', 'persuasive').
 *                 example: "friendly"
 *               language:
 *                 type: string
 *                 nullable: true
 *                 description: The language for the generated document (e.g., 'en', 'es', 'fr').
 *                 example: "en"
 *             required:
 *               - documentType
 *               - parameters
 *     responses:
 *       200:
 *         description: Successfully generated document.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     generatedText:
 *                       type: string
 *                       description: The content of the generated document.
 *                       example: "Subject: Meeting Reminder\n\nHi John,\n\nJust a friendly reminder..."
 *                     documentId:
 *                       type: string
 *                       description: The ID of the newly generated document.
 *                       example: "65e7b2a3c8d1e0f7a6b5c4d3"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext, // Extract tenant context after auth
  checkDailyRequestLimit, // BUG FIX: Added missing daily request limit check for consistency and resource management.
  createRateLimiter(20, 15),
  validateRequest(DocumentValidation.generateDocumentSchema),
  documentController.generateDocument
);

/**
 * @swagger
 * /api/v1/document-drafting/export:
 *   post:
 *     summary: Export an existing document to a different format.
 *     description: |
 *       This endpoint allows users to export a previously generated or edited document
 *       into various formats (e.g., PDF, DOCX, TXT). Supports both authenticated users and guests.
 *     tags:
 *       - Document Drafting
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               documentId:
 *                 type: string
 *                 description: The ID of the document to export.
 *                 example: "65e7b2a3c8d1e0f7a6b5c4d3"
 *               format:
 *                 type: string
 *                 description: The desired export format (e.g., 'pdf', 'docx', 'txt', 'html').
 *                 example: "pdf"
 *               options:
 *                 type: object
 *                 nullable: true
 *                 description: Optional format-specific export options (e.g., page size for PDF).
 *                 example:
 *                   pageSize: "A4"
 *                   orientation: "portrait"
 *             required:
 *               - documentId
 *               - format
 *     responses:
 *       200:
 *         description: Successfully exported document. Returns a URL to the exported file or the file content directly.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     exportUrl:
 *                       type: string
 *                       format: uri
 *                       description: URL to download the exported document.
 *                       example: "https://example.com/exports/document-123.pdf"
 *                     fileContent:
 *                       type: string
 *                       format: binary
 *                       description: (Optional) Base64 encoded content of the exported file, if not a URL.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/export',
  optionalAuth(),
  extractTenantContext, // Extract tenant context after auth
  checkDailyRequestLimit, // BUG FIX: Added missing daily request limit check for consistency and resource management.
  createRateLimiter(20, 15),
  validateRequest(DocumentValidation.exportDocumentSchema),
  documentController.exportDocument
);

/**
 * @swagger
 * /api/v1/document-drafting/edit:
 *   post:
 *     summary: Edit or refine an existing document using AI.
 *     description: |
 *       This endpoint allows users to modify or refine an existing document by providing
 *       instructions to an AI. This can include rephrasing, expanding, summarizing, or
 *       correcting content. Supports both authenticated users and guests.
 *     tags:
 *       - Document Drafting
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               documentId:
 *                 type: string
 *                 description: The ID of the document to edit.
 *                 example: "65e7b2a3c8d1e0f7a6b5c4d3"
 *               editInstruction:
 *                 type: string
 *                 description: Natural language instruction for how to edit the document.
 *                 example: "Make the introduction more engaging and add a call to action at the end."
 *               section:
 *                 type: string
 *                 nullable: true
 *                 description: Optional, specific section of the document to apply the edit to.
 *                 example: "introduction"
 *             required:
 *               - documentId
 *               - editInstruction
 *     responses:
 *       200:
 *         description: Successfully edited document.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     updatedText:
 *                       type: string
 *                       description: The full content of the updated document.
 *                       example: "The new engaging introduction...\n\n...and a strong call to action."
 *                     documentId:
 *                       type: string
 *                       description: The ID of the edited document.
 *                       example: "65e7b2a3c8d1e0f7a6b5c4d3"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/edit',
  optionalAuth(),
  extractTenantContext, // Extract tenant context after auth
  checkDailyRequestLimit, // BUG FIX: Added missing daily request limit check for consistency and resource management.
  createRateLimiter(20, 15),
  validateRequest(DocumentValidation.editDocumentSchema),
  documentController.editDocument
);

// Mount the router onto the main application under a specific API path.
app.use('/api/v1/document-drafting', router);

// --- Server Startup and Graceful Shutdown ---

// Cloud Run provides the PORT environment variable. Default to 8080 for local development.
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

const startServer = async () => {
  try {
    // 1. Initialize external connections (e.g., database) before starting the server.
    await database.connect();

    // 2. Start the HTTP server.
    server.listen(PORT, () => {
      // 3. Once the server is listening, mark the application as ready.
      isReady = true;
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log('✅ Application is ready to accept traffic.');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    // If startup fails, exit the process to allow the container orchestrator to restart it.
    process.exit(1);
  }
};

// Function to handle graceful shutdown.
const gracefulShutdown = signal => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // 1. Stop the readiness probe. This tells Cloud Run to stop sending new requests.
  isReady = false;
  console.log('🚦 Readiness probe set to false. No new traffic will be accepted.');

  // 2. Stop the server from accepting new connections.
  // The callback is executed once all existing, in-flight requests are finished.
  server.close(async () => {
    console.log('✅ All connections closed.');
    try {
      // 3. Close database connections and perform other cleanup.
      await database.close();
    } catch (error) {
      console.error('❌ Error during resource cleanup:', error);
    } finally {
      console.log('👋 Server shut down gracefully.');
      // 4. Exit the process.
      process.exit(0);
    }
  });

  // 4. If connections are not closed within a timeout period, force shutdown.
  // This is a safeguard against hanging requests. Cloud Run's default is 10 seconds.
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcing shutdown.');
    process.exit(1);
  }, 10000); // 10 seconds
};

// Listen for termination signals. Cloud Run sends SIGTERM.
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
// Also listen for SIGINT for local development (Ctrl+C).
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the application.
startServer();