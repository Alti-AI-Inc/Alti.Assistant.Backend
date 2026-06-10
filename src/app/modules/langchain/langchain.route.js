import express from 'express';
import { LangchainController } from './langchain.controller.js';

/**
 * @fileoverview Express router defining endpoints for Langchain integration, repository management, and LCEL (LangChain Expression Language) custom chain execution.
 * @module langchain/routes
 * @requires express
 * @requires LangchainController
 */

const router = express.Router();

/**
 * @openapi
 * /api/v1/langchain/repositories:
 *   get:
 *     summary: Retrieve available repositories
 *     description: Fetches a list of connected repositories available for Langchain operations. Access is restricted based on the user's tenant context.
 *     tags: [Langchain]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved repositories.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/repositories', LangchainController.getRepositories);

/**
 * @openapi
 * /api/v1/langchain/stats:
 *   get:
 *     summary: Get Langchain usage statistics
 *     description: Retrieves performance metrics, execution counts, and system stats for Langchain operations within the current tenant.
 *     tags: [Langchain]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved statistics.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/stats', LangchainController.getStats);

/**
 * @openapi
 * /api/v1/langchain/import:
 *   post:
 *     summary: Import a submodule
 *     description: Imports a specific submodule or repository into the Langchain context. Requires administrative privileges (`role: admin`).
 *     tags: [Langchain]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - repoUrl
 *             properties:
 *               repoUrl:
 *                 type: string
 *                 description: The URL of the repository/submodule to import.
 *     responses:
 *       201:
 *         description: Submodule imported successfully.
 *       400:
 *         description: Invalid request body.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - Insufficient permissions.
 *       500:
 *         description: Internal server error.
 */
router.post('/import', LangchainController.importSubmodule);

// ── LCEL Custom Chain Registry & Execution Endpoints ────────────────────────

/**
 * @openapi
 * /api/v1/langchain/chains:
 *   post:
 *     summary: Create a new LCEL custom chain
 *     description: Registers a new LangChain Expression Language (LCEL) chain configuration under the current tenant context.
 *     tags: [Langchain Chains]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - definition
 *             properties:
 *               name:
 *                 type: string
 *                 description: Unique name for the custom chain.
 *               definition:
 *                 type: object
 *                 description: JSON representation of the LCEL chain structure.
 *     responses:
 *       201:
 *         description: Chain created successfully.
 *       400:
 *         description: Invalid chain definition.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.post('/chains', LangchainController.createChain);

/**
 * @openapi
 * /api/v1/langchain/chains:
 *   get:
 *     summary: List all registered LCEL chains
 *     description: Retrieves a list of all custom LCEL chains configured in the system. Supports multi-tenant isolation.
 *     tags: [Langchain Chains]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of chains retrieved successfully.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/chains', LangchainController.listChains);

/**
 * @openapi
 * /api/v1/langchain/chains/{chainId}/run:
 *   post:
 *     summary: Execute an LCEL chain
 *     description: Runs a specific LCEL chain by its ID with the provided input variables.
 *     tags: [Langchain Chains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the chain.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               input:
 *                 type: object
 *                 description: Input variables for the chain execution.
 *     responses:
 *       200:
 *         description: Chain executed successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Chain not found.
 *       500:
 *         description: Internal server error.
 */
router.post('/chains/:chainId/run', LangchainController.runChain);

/**
 * @openapi
 * /api/v1/langchain/chains/{chainId}/executions:
 *   get:
 *     summary: Get execution history for a chain
 *     description: Retrieves the execution logs and history for a specific LCEL chain.
 *     tags: [Langchain Chains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the chain.
 *     responses:
 *       200:
 *         description: Execution history retrieved successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Chain not found.
 *       500:
 *         description: Internal server error.
 */
router.get('/chains/:chainId/executions', LangchainController.getExecutions);

/**
 * @openapi
 * /api/v1/langchain/chains/{chainId}/optimize:
 *   get:
 *     summary: Optimize an LCEL chain
 *     description: Analyzes the chain configuration and suggests or applies optimizations. Requires write permissions on the chain.
 *     tags: [Langchain Chains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the chain.
 *     responses:
 *       200:
 *         description: Optimization analysis completed.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Chain not found.
 *       500:
 *         description: Internal server error.
 */
router.get('/chains/:chainId/optimize', LangchainController.optimizeChain);

/**
 * @openapi
 * /api/v1/langchain/chains/{chainId}/rollback:
 *   post:
 *     summary: Rollback chain to a previous version
 *     description: Reverts the chain configuration to a specified previous version. Requires administrative or editor privileges.
 *     tags: [Langchain Chains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the chain.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - version
 *             properties:
 *               version:
 *                 type: integer
 *                 description: The target version number to roll back to.
 *     responses:
 *       200:
 *         description: Chain successfully rolled back.
 *       400:
 *         description: Invalid version specified.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Chain or version not found.
 *       500:
 *         description: Internal server error.
 */
router.post('/chains/:chainId/rollback', LangchainController.rollbackChain);

/**
 * @openapi
 * /api/v1/langchain/chains/{chainId}/versions:
 *   get:
 *     summary: Get version history of a chain
 *     description: Retrieves all historical versions of the specified LCEL chain.
 *     tags: [Langchain Chains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the chain.
 *     responses:
 *       200:
 *         description: Version history retrieved successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Chain not found.
 *       500:
 *         description: Internal server error.
 */
router.get('/chains/:chainId/versions', LangchainController.getChainVersions);

/**
 * @openapi
 * /api/v1/langchain/chains/{chainId}/benchmark:
 *   post:
 *     summary: Benchmark an LCEL chain
 *     description: Runs performance and latency benchmarks on the specified chain.
 *     tags: [Langchain Chains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the chain.
 *     responses:
 *       200:
 *         description: Benchmark completed successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Chain not found.
 *       500:
 *         description: Internal server error.
 */
router.post('/chains/:chainId/benchmark', LangchainController.benchmarkChain);

/**
 * @openapi
 * /api/v1/langchain/chains/{chainId}/stream:
 *   post:
 *     summary: Stream chain execution
 *     description: Executes the chain and streams the response tokens/chunks in real-time.
 *     tags: [Langchain Chains]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the chain.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               input:
 *                 type: object
 *                 description: Input variables for the streaming execution.
 *     responses:
 *       200:
 *         description: Stream initiated successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Chain not found.
 *       500:
 *         description: Internal server error.
 */
router.post('/chains/:chainId/stream', LangchainController.streamChain);

export const langchainRoutes = router;