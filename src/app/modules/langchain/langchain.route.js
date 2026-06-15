import express from 'express';
import { LangchainController } from './langchain.controller.js';
import asyncHandler from '../../utils/catchAsync.js';

/**
 * @fileoverview Express router defining endpoints for Langchain integration, repository management, and LCEL (LangChain Expression Language) custom chain execution.
 * @module langchain/routes
 * @requires express
 * @requires LangchainController
 * @requires asyncHandler
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
router.get('/repositories', asyncHandler(LangchainController.getRepositories));

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
router.get('/stats', asyncHandler(LangchainController.getStats));

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
router.post('/import', asyncHandler(LangchainController.importSubmodule));

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
router.post('/chains', asyncHandler(LangchainController.createChain));

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
router.get('/chains', asyncHandler(LangchainController.listChains));

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
router.post('/chains/:chainId/run', asyncHandler(LangchainController.runChain));

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
router.get('/chains/:chainId/executions', asyncHandler(LangchainController.getExecutions));

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
router.get('/chains/:chainId/optimize', asyncHandler(LangchainController.optimizeChain));

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
router.post('/chains/:chainId/rollback', asyncHandler(LangchainController.rollbackChain));

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
router.get('/chains/:chainId/versions', asyncHandler(LangchainController.getChainVersions));

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
router.post('/chains/:chainId/benchmark', asyncHandler(LangchainController.benchmarkChain));

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
router.post('/chains/:chainId/stream', asyncHandler(LangchainController.streamChain));

// ─── Platform Owner / Super Admin Endpoints ───────────────────────────────────
// These endpoints are designed for platform-level administration and oversight.
// Access should be strictly limited to users with the 'platform-owner' or 'super-admin' role.

/**
 * @openapi
 * /api/v1/platform/langchain/stats:
 *   get:
 *     summary: Get global Langchain usage statistics
 *     description: Retrieves aggregated performance metrics, execution counts, and system stats for Langchain operations across ALL tenants. This provides a platform-wide overview.
 *     tags: [Platform Owner]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved global statistics.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - Insufficient permissions.
 *       500:
 *         description: Internal server error.
 */
router.get('/platform/langchain/stats', asyncHandler(LangchainController.getGlobalStats));

/**
 * @openapi
 * /api/v1/platform/langchain/logs:
 *   get:
 *     summary: View global Langchain execution logs
 *     description: Fetches a stream of all Langchain execution logs, errors, and audit trails from all tenants. Supports filtering by tenant, chain ID, or time range.
 *     tags: [Platform Owner]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Optional. Filter logs by a specific tenant ID.
 *       - in: query
 *         name: chainId
 *         schema:
 *           type: string
 *         description: Optional. Filter logs by a specific chain ID.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Number of log entries to return.
 *     responses:
 *       200:
 *         description: Successfully retrieved global logs.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - Insufficient permissions.
 *       500:
 *         description: Internal server error.
 */
router.get('/platform/langchain/logs', asyncHandler(LangchainController.getGlobalLogs));

/**
 * @openapi
 * /api/v1/platform/langchain/config:
 *   get:
 *     summary: Get system-wide Langchain configuration
 *     description: Retrieves the global configuration for the Langchain module, such as default model providers, enabled features, and platform-wide rate limits.
 *     tags: [Platform Owner]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved global configuration.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - Insufficient permissions.
 *       500:
 *         description: Internal server error.
 */
router.get('/platform/langchain/config', asyncHandler(LangchainController.getGlobalConfig));

/**
 * @openapi
 * /api/v1/platform/langchain/config:
 *   put:
 *     summary: Update system-wide Langchain configuration
 *     description: Modifies the global configuration for the Langchain module. This can be used to override tenant limits, change default models, or toggle features for all users.
 *     tags: [Platform Owner]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               defaultModel:
 *                 type: string
 *                 description: The default LLM provider and model for the platform.
 *               maxTokensOverride:
 *                 type: integer
 *                 description: A global override for the maximum tokens allowed per request.
 *               enableVectorStores:
 *                 type: boolean
 *                 description: Globally enable or disable vector store functionality.
 *     responses:
 *       200:
 *         description: Global configuration updated successfully.
 *       400:
 *         description: Invalid configuration body.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - Insufficient permissions.
 *       500:
 *         description: Internal server error.
 */
router.put('/platform/langchain/config', asyncHandler(LangchainController.updateGlobalConfig));

/**
 * @openapi
 * /api/v1/platform/langchain/tenants/{tenantId}/chains:
 *   get:
 *     summary: List all chains for a specific tenant
 *     description: Allows a Platform Owner to view all LCEL chains belonging to a specific tenant, bypassing standard tenant isolation.
 *     tags: [Platform Owner]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the tenant.
 *     responses:
 *       200:
 *         description: Successfully retrieved tenant's chains.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - Insufficient permissions.
 *       404:
 *         description: Tenant not found.
 *       500:
 *         description: Internal server error.
 */
router.get('/platform/langchain/tenants/:tenantId/chains', asyncHandler(LangchainController.getTenantChains));

/**
 * @openapi
 * /api/v1/platform/langchain/tenants/{tenantId}/status:
 *   patch:
 *     summary: Suspend or re-enable a tenant's Langchain access
 *     description: Allows a Platform Owner to globally suspend or re-enable a specific tenant's access to all Langchain module features. This is a master switch for a tenant's AI capabilities, useful for billing or policy enforcement.
 *     tags: [Platform Owner]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the tenant.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enabled
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: Set to `false` to suspend the tenant's access, `true` to re-enable it.
 *     responses:
 *       200:
 *         description: Tenant's Langchain status updated successfully.
 *       400:
 *         description: Invalid request body.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - Insufficient permissions.
 *       404:
 *         description: Tenant not found.
 *       500:
 *         description: Internal server error.
 */
router.patch('/platform/langchain/tenants/:tenantId/status', asyncHandler(LangchainController.updateTenantLangchainStatus));

/**
 * @openapi
 * /api/v1/platform/langchain/tenants/{tenantId}/chains/{chainId}/toggle:
 *   patch:
 *     summary: Enable or disable a specific tenant's chain
 *     description: Allows a Platform Owner to forcefully enable or disable a specific chain for a tenant. This is useful for managing problematic or resource-intensive chains.
 *     tags: [Platform Owner]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the tenant.
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the chain to toggle.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enabled
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: Set to `false` to disable the chain, `true` to enable it.
 *     responses:
 *       200:
 *         description: Chain status updated successfully.
 *       400:
 *         description: Invalid request body.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - Insufficient permissions.
 *       404:
 *         description: Tenant or chain not found.
 *       500:
 *         description: Internal server error.
 */
router.patch(
  '/platform/langchain/tenants/:tenantId/chains/:chainId/toggle',
  asyncHandler(LangchainController.toggleTenantChain)
);

export const langchainRoutes = router;