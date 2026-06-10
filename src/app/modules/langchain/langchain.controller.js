/**
 * @module LangchainController
 * @description Controller for managing Langchain-related operations, including catalog search,
 * submodule imports, custom LCEL chain registry, execution, optimization, versioning, streaming, and benchmarking.
 */
import httpStatus from 'http-status';
import { LangchainService } from './langchain.service.js';
import { LangchainExecutionService } from './langchainExecution.service.js';
import { langchainOptimizerService } from './langchainOptimizer.service.js';
import { langchainVersionService } from './langchainVersion.service.js';
import { langchainEvaluatorService } from './langchainEvaluator.service.js';
import { langchainStreamService } from './langchainStream.service.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';

/**
 * @swagger
 * /v1/langchain/repositories:
 *   get:
 *     summary: Search Langchain catalog repositories
 *     description: Retrieve a list of Langchain repositories from the catalog, with optional filtering and pagination.
 *     tags: [Langchain Catalog]
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search term for repository names or descriptions.
 *       - in: query
 *         name: license
 *         schema:
 *           type: string
 *         description: Filter by license type (e.g., MIT, Apache-2.0).
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by programming language (e.g., Python, JavaScript).
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Maximum number of repositories to return.
 *         default: 10
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination.
 *         default: 1
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: Sort order (e.g., 'stars:desc', 'name:asc').
 *     responses:
 *       200:
 *         description: Successfully retrieved Langchain repositories.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name: { type: string }
 *                       description: { type: string }
 *                       url: { type: string }
 *                       stars: { type: integer }
 *                       license: { type: string }
 *                       language: { type: string }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 totalPages: { type: integer }
 *                 totalResults: { type: integer }
 *       500:
 *         description: Internal server error.
 */
const getRepositories = async (req, res, next) => {
  try {
    const { query, license, language, limit, page, sortBy } = req.query;
    const result = await LangchainService.searchLangchainCatalog(query, {
      license,
      language,
      limit,
      page,
      sortBy
    });
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /v1/langchain/stats:
 *   get:
 *     summary: Get Langchain catalog statistics
 *     description: Retrieve aggregated statistics about the Langchain catalog, such as total repositories, languages, and licenses.
 *     tags: [Langchain Catalog]
 *     responses:
 *       200:
 *         description: Successfully retrieved Langchain statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalRepositories: { type: integer }
 *                 languages:
 *                   type: object
 *                   additionalProperties: { type: integer }
 *                 licenses:
 *                   type: object
 *                   additionalProperties: { type: integer }
 *       500:
 *         description: Internal server error.
 */
const getStats = async (req, res, next) => {
  try {
    const result = await LangchainService.getLangchainStats();
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /v1/langchain/import:
 *   post:
 *     summary: Import a Langchain submodule
 *     description: Imports a specified Langchain submodule into the application's environment.
 *     tags: [Langchain Catalog]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - repoName
 *             properties:
 *               repoName:
 *                 type: string
 *                 description: The name of the repository/submodule to import (e.g., 'langchain-community').
 *                 example: langchain-community
 *     responses:
 *       200:
 *         description: Submodule imported successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Submodule 'langchain-community' imported successfully." }
 *       400:
 *         description: Bad request, e.g., submodule already exists or invalid name.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Submodule 'langchain-community' already exists or failed to import." }
 *       500:
 *         description: Internal server error.
 */
const importSubmodule = async (req, res, next) => {
  try {
    const { repoName } = req.body;
    const result = await LangchainService.importLangchainSubmodule(repoName);
    if (result.success) {
      res.status(httpStatus.OK).json(result);
    } else {
      res.status(httpStatus.BAD_REQUEST).json(result);
    }
  } catch (error) {
    next(error);
  }
};

// ── LCEL Custom Chain Registry & Execution Endpoints ────────────────────────

/**
 * @swagger
 * /v1/langchain/chains:
 *   post:
 *     summary: Create or update a custom LangChain Expression Language (LCEL) chain
 *     description: Registers a new LCEL chain or updates an existing one for a specific user.
 *                  If a chain with the same name and user ID exists, a snapshot is created before updating.
 *     tags: [Langchain Chains]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - inputVariables
 *               - outputVariables
 *               - steps
 *             properties:
 *               name:
 *                 type: string
 *                 description: Unique name for the LCEL chain.
 *                 example: MyGreetingChain
 *               description:
 *                 type: string
 *                 description: A brief description of what the chain does.
 *                 example: A simple chain that greets the user by name.
 *               inputVariables:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of expected input variable names for the chain.
 *                 example: ["name", "language"]
 *               outputVariables:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of expected output variable names from the chain.
 *                 example: ["greeting"]
 *               steps:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type: { type: string, description: "Type of the step (e.g., 'prompt', 'llm', 'parser')." }
 *                     config: { type: object, description: "Configuration for the step." }
 *                 description: An array defining the sequence of steps in the LCEL chain.
 *                 example:
 *                   - type: prompt
 *                     config:
 *                       template: "Hello, {name}! How are you doing in {language}?"
 *                   - type: llm
 *                     config:
 *                       model: "gpt-3.5-turbo"
 *                       temperature: 0.7
 *                   - type: parser
 *                     config:
 *                       type: "string"
 *               changeSummary:
 *                 type: string
 *                 description: A summary of the changes made, used for versioning.
 *                 example: Updated prompt template for better greetings.
 *     responses:
 *       201:
 *         description: LCEL chain registered/updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "LangChain Expression Language (LCEL) chain 'MyGreetingChain' registered successfully!" }
 *                 chain:
 *                   $ref: '#/components/schemas/LangchainChain'
 *       500:
 *         description: Internal server error.
 */
const createChain = async (req, res, next) => {
  try {
    const { name, description, inputVariables, outputVariables, steps, changeSummary } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    // Check if the chain already exists; if so, snapshot it first before overwriting
    // Optimization: Added .lean() for read-only query to get plain JavaScript objects, improving performance.
    // Indexing Recommendation: Consider adding a compound index on `{ userId: 1, name: 1 }` to LangchainChain model for faster lookups.
    const existingChain = await LangchainChain.findOne({ userId, name }).lean();
    if (existingChain) {
      await langchainVersionService.createSnapshot(
        existingChain._id,
        userId,
        changeSummary || `Version backup before edit mapping.`
      );
    }

    const newChain = await LangchainChain.findOneAndUpdate(
      { userId, name },
      { description, inputVariables, outputVariables, steps },
      { new: true, upsert: true }
    );

    // If it's a completely new chain, create the initial snapshot v1
    if (!existingChain) {
      await langchainVersionService.createSnapshot(
        newChain._id,
        userId,
        'Initial version v1 registered.'
      );
    }

    res.status(httpStatus.CREATED).json({
      success: true,
      message: `LangChain Expression Language (LCEL) chain "${name}" registered successfully!`,
      chain: newChain,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /v1/langchain/chains:
 *   get:
 *     summary: List all custom LCEL chains for the authenticated user
 *     description: Retrieves a list of all active LangChain Expression Language (LCEL) chains registered by the current user.
 *     tags: [Langchain Chains]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved list of chains.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 chains:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LangchainChain'
 *       500:
 *         description: Internal server error.
 */
const listChains = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    // Optimization: Added .lean() for read-only query to get plain JavaScript objects, improving performance.
    // Indexing Recommendation: Consider adding a compound index on `{ userId: 1, isActive: 1 }` to LangchainChain model for faster lookups.
    const chains = await LangchainChain.find({ userId, isActive: true }).lean();
    res.status(httpStatus.OK).json({ success: true, chains });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /v1/langchain/chains/{chainId}/run:
 *   post:
 *     summary: Execute a custom LCEL chain
 *     description: Runs a specified LangChain Expression Language (LCEL) chain with provided inputs.
 *     tags: [Langchain Chains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the LCEL chain to execute.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inputs:
 *                 type: object
 *                 description: Key-value pairs of input variables required by the chain.
 *                 example:
 *                   name: "Alice"
 *                   language: "English"
 *     responses:
 *       200:
 *         description: Chain executed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "LangChain custom chain executed successfully!" }
 *                 execution:
 *                   $ref: '#/components/schemas/LangchainExecution'
 *       404:
 *         description: Chain not found.
 *       500:
 *         description: Internal server error or chain execution failed.
 */
const runChain = async (req, res, next) => {
  try {
    const { chainId } = req.params;
    const { inputs } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    const executionRecord = await LangchainExecutionService.executeChain(chainId, inputs || {}, userId);
    res.status(httpStatus.OK).json({
      success: true,
      message: 'LangChain custom chain executed successfully!',
      execution: executionRecord,
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: `LangChain execution failed: ${error.message}`,
    });
  }
};

/**
 * @swagger
 * /v1/langchain/chains/{chainId}/executions:
 *   get:
 *     summary: Get execution history for a specific LCEL chain
 *     description: Retrieves a list of recent execution records for a given LangChain Expression Language (LCEL) chain.
 *     tags: [Langchain Chains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the LCEL chain.
 *     responses:
 *       200:
 *         description: Successfully retrieved execution history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 executions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LangchainExecution'
 *       500:
 *         description: Internal server error.
 */
const getExecutions = async (req, res, next) => {
  try {
    const { chainId } = req.params;
    const userId = req.user?.userId || req.user?.id || 'default_user';
    // Optimization: Added .lean() for read-only query to get plain JavaScript objects, improving performance.
    // Indexing Recommendation: Consider adding a compound index on `{ chainId: 1, userId: 1, createdAt: -1 }` to LangchainExecution model for faster lookups and sorting.
    const executions = await LangchainExecution.find({ chainId, userId }).sort({ createdAt: -1 }).limit(50).lean();
    res.status(httpStatus.OK).json({ success: true, executions });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /v1/langchain/chains/{chainId}/optimize:
 *   post:
 *     summary: Optimize a custom LCEL chain
 *     description: Initiates an optimization process for a specified LangChain Expression Language (LCEL) chain.
 *                  This typically involves analyzing execution traces and suggesting improvements.
 *                  A snapshot of the current chain configuration is automatically created before optimization.
 *     tags: [Langchain Chains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the LCEL chain to optimize.
 *     responses:
 *       200:
 *         description: Optimization process initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Chain optimization initiated. Check logs for details." }
 *                 optimizationReport:
 *                   type: object
 *                   description: Details about the optimization process or results.
 *       500:
 *         description: Internal server error or optimization failed.
 */
const optimizeChain = async (req, res, next) => {
  try {
    const { chainId } = req.params;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    // Auto-create snapshot of current settings before optimizations apply
    await langchainVersionService.createSnapshot(
      chainId,
      userId,
      `Version backup before trace diagnostics optimization.`
    );

    const result = await langchainOptimizerService.optimizeChain(chainId, userId);
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /v1/langchain/chains/{chainId}/rollback:
 *   post:
 *     summary: Rollback a custom LCEL chain to a previous version
 *     description: Restores a LangChain Expression Language (LCEL) chain to a specified historical version.
 *     tags: [Langchain Chains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the LCEL chain to rollback.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - versionNumber
 *             properties:
 *               versionNumber:
 *                 type: integer
 *                 description: The specific version number to rollback to.
 *                 example: 2
 *     responses:
 *       200:
 *         description: Chain successfully rolled back to the specified version.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Chain 'MyGreetingChain' rolled back to version 2." }
 *                 chain:
 *                   $ref: '#/components/schemas/LangchainChain'
 *       400:
 *         description: Bad request, e.g., missing version number or invalid version.
 *       404:
 *         description: Chain or version not found.
 *       500:
 *         description: Internal server error.
 */
const rollbackChain = async (req, res, next) => {
  try {
    const { chainId } = req.params;
    const { versionNumber } = req.body;
    if (!versionNumber) {
      return res.status(httpStatus.BAD_REQUEST).json({ success: false, message: 'versionNumber is required' });
    }
    const userId = req.user?.userId || req.user?.id || 'default_user';

    const result = await langchainVersionService.rollbackToVersion(chainId, versionNumber, userId);
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /v1/langchain/chains/{chainId}/versions:
 *   get:
 *     summary: Get version history for a custom LCEL chain
 *     description: Retrieves all historical versions and snapshots for a specified LangChain Expression Language (LCEL) chain.
 *     tags: [Langchain Chains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the LCEL chain.
 *     responses:
 *       200:
 *         description: Successfully retrieved version history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 versions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LangchainChainVersion'
 *       404:
 *         description: Chain not found.
 *       500:
 *         description: Internal server error.
 */
const getChainVersions = async (req, res, next) => {
  try {
    const { chainId } = req.params;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    const result = await langchainVersionService.getVersionHistory(chainId, userId);
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /v1/langchain/chains/{chainId}/stream:
 *   post:
 *     summary: Stream the execution of a custom LCEL chain
 *     description: Executes a specified LangChain Expression Language (LCEL) chain and streams its output
 *                  using Server-Sent Events (SSE). This is ideal for long-running or interactive chains.
 *     tags: [Langchain Chains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the LCEL chain to stream.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inputs:
 *                 type: object
 *                 description: Key-value pairs of input variables required by the chain.
 *                 example:
 *                   question: "What is the capital of France?"
 *     responses:
 *       200:
 *         description: Server-Sent Events stream for chain execution.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: |
 *                 data: {"event":"start","message":"Chain execution started."}
 *
 *                 data: {"event":"chunk","content":"The capital of France is "}
 *
 *                 data: {"event":"chunk","content":"Paris."}
 *
 *                 data: {"event":"end","output":{"answer":"The capital of France is Paris."}}
 *
 *       500:
 *         description: Internal server error or chain execution failed.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: |
 *                 data: {"event":"error","message":"Chain execution failed: [error details]"}
 */
const streamChain = async (req, res, next) => {
  const { chainId } = req.params;
  const { inputs } = req.body;
  const userId = req.user?.userId || req.user?.id || 'default_user';

  // Establish SSE connection
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering for SSE
  res.flushHeaders();

  const emit = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (writeErr) {
      // Client disconnected, ignore write errors
      console.warn(`SSE client disconnected for chainId ${chainId}: ${writeErr.message}`);
    }
  };

  try {
    await langchainStreamService.streamChainExecution(chainId, inputs || {}, userId, emit);
  } catch (err) {
    emit({ event: 'error', message: err.message });
  } finally {
    res.end();
  }
};

/**
 * @swagger
 * /v1/langchain/chains/{chainId}/benchmark:
 *   post:
 *     summary: Benchmark two versions of a custom LCEL chain
 *     description: Compares the performance and output quality of two different versions of a LangChain Expression Language (LCEL) chain using a provided test suite.
 *     tags: [Langchain Chains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the LCEL chain to benchmark.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - versionA
 *               - versionB
 *             properties:
 *               versionA:
 *                 type: integer
 *                 description: The version number of the first chain to compare.
 *                 example: 1
 *               versionB:
 *                 type: integer
 *                 description: The version number of the second chain to compare.
 *                 example: 2
 *               testSuite:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     inputs:
 *                       type: object
 *                       description: Input variables for a single test case.
 *                     expectedOutput:
 *                       type: object
 *                       description: (Optional) Expected output for evaluation.
 *                 description: An array of test cases, each with inputs and optionally expected outputs.
 *                 example:
 *                   - inputs: { name: "John" }
 *                     expectedOutput: { greeting: "Hello, John!" }
 *                   - inputs: { name: "Jane" }
 *     responses:
 *       200:
 *         description: Benchmark results successfully generated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Benchmark completed successfully." }
 *                 benchmarkResults:
 *                   type: object
 *                   properties:
 *                     versionA: { type: object }
 *                     versionB: { type: object }
 *                     comparison: { type: object }
 *       400:
 *         description: Bad request, e.g., missing version numbers.
 *       404:
 *         description: Chain or specified versions not found.
 *       500:
 *         description: Internal server error or benchmarking failed.
 */
const benchmarkChain = async (req, res, next) => {
  try {
    const { chainId } = req.params;
    const { versionA, versionB, testSuite } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!versionA || !versionB) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Both versionA and versionB are required in the request body.',
      });
    }

    const result = await langchainEvaluatorService.benchmarkVersions(
      chainId,
      versionA,
      versionB,
      testSuite || [],
      userId
    );
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @typedef {object} LangchainController
 * @property {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} streamChain - Streams the execution of a custom LCEL chain.
 * @property {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} getRepositories - Searches Langchain catalog repositories.
 * @property {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} getStats - Retrieves Langchain catalog statistics.
 * @property {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} importSubmodule - Imports a Langchain submodule.
 * @property {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} createChain - Creates or updates a custom LCEL chain.
 * @property {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} listChains - Lists all custom LCEL chains for the authenticated user.
 * @property {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} runChain - Executes a custom LCEL chain.
 * @property {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} getExecutions - Gets execution history for a specific LCEL chain.
 * @property {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} optimizeChain - Optimizes a custom LCEL chain.
 * @property {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} rollbackChain - Rolls back a custom LCEL chain to a previous version.
 * @property {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} getChainVersions - Gets version history for a custom LCEL chain.
 * @property {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} benchmarkChain - Benchmarks two versions of a custom LCEL chain.
 */
export const LangchainController = {
  streamChain,
  getRepositories,
  getStats,
  importSubmodule,
  createChain,
  listChains,
  runChain,
  getExecutions,
  optimizeChain,
  rollbackChain,
  getChainVersions,
  benchmarkChain,
};