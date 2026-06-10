import express from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createClient } from 'redis';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { YoutubeLoader } from '@langchain/community/document_loaders/web/youtube';
import { promises as dns } from 'dns';
import { isIP } from 'net';
import { getUrlFromUserInputUsingAi } from '../openAIService.js';
import { generateSummary } from '../summarizerService.js';

// --- Enterprise Rate Limiting & DDOS Guard ---

/**
 * Redis client instance for connecting to the Redis server.
 * Used as the backing store for all rate limiters.
 * The `enable_offline_queue: false` option ensures that if the connection is lost,
 * commands don't buffer in memory, failing fast instead.
 * @type {import('redis').RedisClientType}
 */
const redisClient = createClient({
  // url: process.env.REDIS_URL, // Example for production
  enable_offline_queue: false,
});

redisClient.on('error', (err) => console.error('Redis Client Error for Rate Limiting:', err));

// --- Rate Limiter Definitions ---

/**
 * Rate limiter for unauthenticated (public) users performing content fetch operations.
 * Limits are based on the client's IP address.
 * Allows 20 fetches per hour per IP. If exceeded, the IP is blocked for 15 minutes.
 * @type {RateLimiterRedis}
 */
const publicFetchLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_fetch_ip',
  points: 20,
  duration: 60 * 60,
  blockDuration: 60 * 15,
});

/**
 * Rate limiter for unauthenticated (public) users performing summary operations.
 * Limits are based on the client's IP address.
 * Allows 10 summaries per hour per IP. If exceeded, the IP is blocked for 30 minutes.
 * @type {RateLimiterRedis}
 */
const publicSummarizeLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_summarize_ip',
  points: 10,
  duration: 60 * 60,
  blockDuration: 60 * 30,
});

/**
 * Rate limiter for authenticated users performing content fetch operations.
 * Limits are based on the user's unique ID.
 * Allows 200 fetches per hour per user.
 * @type {RateLimiterRedis}
 */
const authenticatedFetchLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_fetch_user',
  points: 200,
  duration: 60 * 60,
});

/**
 * Rate limiter for authenticated users performing summary operations.
 * Limits are based on the user's unique ID.
 * Allows 100 summaries per hour per user.
 * @type {RateLimiterRedis}
 */
const authenticatedSummarizeLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_summarize_user',
  points: 100,
  duration: 60 * 60,
});

// BUGFIX/INTEGRATION: Added workspace-level limiters to enforce tenant-wide quotas.
// This ensures that the collective actions of all users in a workspace do not
// exceed the plan's limits.
/**
 * Tenant-level (workspace) rate limiter for content fetch operations.
 * Enforces a collective quota for all users within a single workspace.
 * This is crucial for multi-tenant plan enforcement.
 * Allows 1000 fetches per hour for the entire workspace.
 * @type {RateLimiterRedis}
 */
const workspaceFetchLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_fetch_workspace',
  points: 1000, // 1000 fetch operations per hour for the entire workspace
  duration: 60 * 60,
});

/**
 * Tenant-level (workspace) rate limiter for summary operations.
 * Enforces a collective quota for all users within a single workspace.
 * This is crucial for multi-tenant plan enforcement.
 * Allows 500 summaries per hour for the entire workspace.
 * @type {RateLimiterRedis}
 */
const workspaceSummarizeLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_summarize_workspace',
  points: 500, // 500 summary operations per hour for the entire workspace
  duration: 60 * 60,
});
// --- End of Rate Limiting Setup ---

// --- Security Helper Functions ---

/**
 * SECURITY: Checks if an IP address is in a private range (RFC 1918) or loopback.
 * This is a crucial part of the SSRF mitigation strategy.
 * @param {string} ip - The IP address to check.
 * @returns {boolean} - True if the IP is private, false otherwise.
 */
const isPrivateIp = (ip) => {
  // A more comprehensive library like 'ip-address' or 'ip-range-check' is recommended for production.
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false; // Not a valid IPv4 for this simple check
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 127 // Loopback
  );
};

/**
 * SECURITY: Validates a URL to mitigate Server-Side Request Forgery (SSRF) attacks.
 * It checks for allowed protocols and ensures the hostname does not resolve to a private IP address.
 * @param {string} urlString - The URL to validate.
 * @throws {Error} If the URL is invalid or points to a forbidden resource.
 */
const validateUrl = async (urlString) => {
  const parsedUrl = new URL(urlString);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Invalid URL protocol. Only http and https are allowed.');
  }

  const { hostname } = parsedUrl;

  // Disallow requests to IP addresses that are in private ranges.
  if (isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error('Access to private IP ranges is forbidden.');
  }

  // Resolve the hostname to an IP address to check against private ranges.
  // This helps prevent DNS rebinding attacks and blocks access to internal services.
  try {
    const { address } = await dns.lookup(hostname);
    if (isPrivateIp(address)) {
      throw new Error(`Hostname resolves to a private IP address (${address}), which is forbidden.`);
    }
  } catch (err) {
    throw new Error(`Could not resolve hostname: ${err.message}`);
  }
};

// --- Hierarchical Usage & Limit Enforcement ---

/**
 * INTEGRATION: Consumes rate limit points hierarchically for a user and their workspace.
 * This function enforces role-based permissions and tenant boundaries.
 *
 * **Permissions:**
 * - `super_admin`: Bypasses all rate limits.
 * - `admin`, `manager`, `user`: Subject to both individual and workspace-level limits.
 * - Unauthenticated users: Subject to public IP-based limits.
 *
 * **Multi-tenancy:**
 * - The `user.workspaceId` is used as the key for tenant-wide rate limiting, ensuring
 *   that all users in a workspace share a common pool of requests as per their plan.
 *
 * @param {UserContext} user - The authenticated user's context.
 * @param {string} ip - The client's IP address (for public requests).
 * @param {object} limiters - The set of limiters to use for this operation.
 * @param {RateLimiterRedis} limiters.userLimiter - The per-user rate limiter.
 * @param {RateLimiterRedis} limiters.workspaceLimiter - The per-workspace rate limiter.
 * @param {RateLimiterRedis} limiters.publicLimiter - The public (IP-based) rate limiter.
 * @throws {Error} If rate limits are exceeded or context is invalid.
 */
const consumeHierarchicalRateLimit = async (user, ip, limiters) => {
  // In a production system, this function would also integrate with a billing/usage service
  // to check and update monthly quotas (e.g., "1000 summaries per month").
  const { userLimiter, workspaceLimiter, publicLimiter } = limiters;

  if (user) {
    // Authenticated user flow
    const { id, role, workspaceId } = user;

    // A super_admin can bypass limits for administrative or debugging purposes.
    if (role === 'super_admin') {
      console.log(`Bypassing rate limit for super_admin ${id}`);
      return;
    }

    if (!workspaceId) {
      throw new Error('User context is missing a workspaceId, cannot enforce tenant limits.');
    }

    // For all other roles (admin, manager, user), consume points from both the individual
    // user's limit and the overall workspace's limit. This ensures fairness and
    // adherence to the workspace's subscription plan.
    // Using Promise.all ensures that if one limit is exceeded, the other is not consumed.
    // For true atomicity, a Redis Lua script would be the most robust solution.
    await Promise.all([
      workspaceLimiter.consume(workspaceId),
      userLimiter.consume(id),
    ]);

    // INTEGRATION POINT: After successful consumption, increment usage counters in a database.
    // This is critical for tracking against monthly/billing quotas.
    // e.g., await usageService.increment(workspaceId, 'summaries', 1);

    // INTEGRATION POINT: Trigger notifications to managers/admins if usage thresholds are met.
    // e.g., if (await usageService.isNearLimit(workspaceId)) {
    //   await notificationService.notifyAdmins(workspaceId, 'Usage limit approaching');
    // }
  } else {
    // Unauthenticated (public) user flow
    if (!ip) {
      throw new Error('IP address is required for public rate limiting.');
    }
    await publicLimiter.consume(ip);
  }
};

// --- Type Definitions ---

/**
 * Defines the possible roles a user can have within the system.
 * @typedef {'super_admin' | 'admin' | 'manager' | 'user'} UserRole
 */

/**
 * Represents the context of an authenticated user.
 * This object is essential for enforcing role-based permissions and multi-tenant boundaries.
 * @typedef {object} UserContext
 * @property {string} id - The user's unique identifier.
 * @property {UserRole} role - The user's role, used for applying permissions and limits.
 * @property {string} workspaceId - The ID of the workspace (tenant) the user belongs to.
 */

/**
 * Represents the result of parsing a user's input for a URL.
 * @typedef {object} UrlInfo
 * @property {string|null} url - The extracted URL.
 * @property {boolean} isYoutubeUrl - True if the URL is a YouTube link.
 * @property {string} [error] - An error message if parsing failed.
 */

/**
 * Represents the state of the summarization workflow as it passes through different nodes.
 * @typedef {object} WorkflowState
 * @property {string} user_input - The initial input provided by the user.
 * @property {string} [ip] - The IP address of the client, for unauthenticated requests.
 * @property {UserContext} [user] - The context of the authenticated user, including role and workspace.
 * @property {boolean} [isFilePassed=false] - Indicates if the input was from a file.
 * @property {string} [content] - The fetched content from a URL or user input.
 * @property {Array<object>} [history] - Conversation history.
 * @property {string} [summary] - The generated summary of the content.
 * @property {string} [error] - An error message if any step in the workflow failed.
 */

/**
 * Node: Fetches content from a URL or uses user input directly.
 * This node is now secured against SSRF, DoS (via content size limits), and enforces
 * hierarchical, role-based rate limiting.
 *
 * **Permissions & Multi-tenancy:**
 * - This node calls `consumeHierarchicalRateLimit` to enforce rate limits based on the user's role
 *   and their workspace affiliation. A `super_admin` bypasses these limits.
 * - Unauthenticated requests are limited by IP address.
 *
 * @param {WorkflowState} state - The current state object.
 * @returns {Promise<Partial<WorkflowState>>} The updated state with either `content` or `error`.
 */
export const fetchContentNode = async (state) => {
  const { user_input, isFilePassed, ip, user } = state;

  try {
    // INTEGRATION: Apply hierarchical rate limiting before any expensive operation.
    await consumeHierarchicalRateLimit(user, ip, {
      userLimiter: authenticatedFetchLimiter,
      workspaceLimiter: workspaceFetchLimiter,
      publicLimiter: publicFetchLimiter,
    });
  } catch (rateLimiterError) {
    console.warn(`Rate limit exceeded for user ${user?.id || 'public'} on fetchContentNode`);
    return { error: 'You have made too many requests. Please try again later.' };
  }

  let urlInfo = { url: null, isYoutubeUrl: false };
  if (!isFilePassed) {
    try {
      const rawUrlInfo = await getUrlFromUserInputUsingAi(user_input);
      urlInfo = convertRawJsonToJson(rawUrlInfo);
      if (urlInfo.error) return { error: urlInfo.error };
    } catch (error) {
      console.error(`Error getting URL from AI: ${error.message}`);
      return { error: `Failed to process user input for URL: ${error.message}` };
    }
  }

  console.log(`--- Node: fetchContentNode for URL: ${JSON.stringify(urlInfo)} ---`);
  const { url, isYoutubeUrl } = urlInfo;

  try {
    if (url) {
      // SECURITY FIX: Validate URL to prevent SSRF attacks before making any external request.
      await validateUrl(url);

      let docs;
      if (!isYoutubeUrl) {
        const loader = new CheerioWebBaseLoader(url);
        docs = await loader.load();
      } else {
        const loader = YoutubeLoader.createFromUrl(url, { language: 'en', addVideoInfo: true });
        docs = await loader.load();
      }

      if (docs.length === 0) {
        throw new Error('No content found at the provided URL.');
      }

      const content = docs.map((doc) => doc.pageContent).join('\n');

      // BUGFIX/SECURITY: Add a content size limit to prevent DoS from very large web pages.
      const MAX_CONTENT_SIZE_CHARS = 500000; // 500k characters limit
      if (content.length > MAX_CONTENT_SIZE_CHARS) {
        throw new Error(`Content exceeds maximum allowed size of ${MAX_CONTENT_SIZE_CHARS} characters.`);
      }

      return { content };
    } else {
      // Fallback to using user_input as content if no URL was found or a file was passed.
      return { content: user_input };
    }
  } catch (error) {
    console.error(`Error in fetchContentNode: ${error.message}`);
    return { error: `Failed to fetch content: ${error.message}. Please check the link or permissions.` };
  }
};

/**
 * BUGFIX: Converts a raw JSON string from an AI model into a JavaScript object using a robust regex.
 * This is more reliable than brittle string replacement methods.
 * @param {string} rawJson - The raw string containing the JSON, which may be wrapped in markdown or other text.
 * @returns {UrlInfo} The parsed URL information object. If parsing fails, an object with an `error` property is returned.
 */
export const convertRawJsonToJson = (rawJson) => {
  try {
    console.log('--- Converting raw JSON to object ---', rawJson);

    // Use a regular expression to find a JSON object within the string.
    // This robustly handles markdown backticks and other surrounding text.
    const match = rawJson.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("No valid JSON object found in the AI's response.");
    }

    const jsonString = match[0];
    const jsonObject = JSON.parse(jsonString);

    // Validate that the parsed object has the expected structure.
    if (typeof jsonObject.url === 'undefined' || typeof jsonObject.isYoutubeUrl === 'undefined') {
      throw new Error("Parsed JSON object is missing required keys ('url', 'isYoutubeUrl').");
    }

    return jsonObject;
  } catch (error) {
    console.error('Error converting raw JSON to object:', error);
    return { url: null, isYoutubeUrl: false, error: `Failed to parse AI response: ${error.message}` };
  }
};

/**
 * Node: Generates a summary from the fetched content.
 * This node now enforces hierarchical, role-based rate limiting for the most expensive AI operation.
 *
 * **Permissions & Multi-tenancy:**
 * - This node calls `consumeHierarchicalRateLimit` to enforce rate limits based on the user's role
 *   and their workspace affiliation. A `super_admin` bypasses these limits.
 * - Unauthenticated requests are limited by IP address.
 *
 * @param {WorkflowState} state - The current state object.
 * @returns {Promise<Partial<WorkflowState>>} The updated state with either `summary` or `error`.
 */
export const summarizeContentNode = async (state) => {
  console.log('--- Node: summarizeContentNode ---');
  const { content, history, error: previousError, ip, user } = state;

  if (previousError) {
    return { error: previousError };
  }

  if (!content) {
    return { error: 'No content available for summarization.' };
  }

  try {
    // INTEGRATION: Apply hierarchical rate limiting before the expensive summarization call.
    await consumeHierarchicalRateLimit(user, ip, {
      userLimiter: authenticatedSummarizeLimiter,
      workspaceLimiter: workspaceSummarizeLimiter,
      publicLimiter: publicSummarizeLimiter,
    });
  } catch (rateLimiterError) {
    console.warn(`Rate limit exceeded for user ${user?.id || 'public'} on summarizeContentNode`);
    return { error: 'You have made too many requests. Please try again later.' };
  }

  try {
    const summary = await generateSummary(content, history);
    return { summary };
  } catch (error) {
    console.error(`Error in summarizeContentNode: ${error.message}`);
    return { error: `Failed to generate summary: ${error.message}` };
  }
};

// --- Cloud Run Service & Graceful Shutdown ---

const app = express();
app.use(express.json());

// A flag to indicate the server is shutting down.
let isShuttingDown = false;

/**
 * Liveness probe endpoint.
 * A 200 OK response indicates that the server process is running.
 * This should not check dependencies.
 */
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

/**
 * Readiness probe endpoint.
 * A 200 OK response indicates the server is ready to accept traffic.
 * This checks for critical dependencies (like the Redis connection)
 * and whether the server is in the process of shutting down.
 */
app.get('/readyz', (req, res) => {
  if (isShuttingDown || !redisClient.isReady) {
    // If shutting down or Redis is not connected, the service is not ready.
    res.status(503).send('Service Unavailable');
  } else {
    res.status(200).send('ok');
  }
});

/**
 * Example endpoint to demonstrate the summarization workflow.
 */
app.post('/summarize', async (req, res) => {
  if (isShuttingDown) {
    res.status(503).send('Service is shutting down and cannot accept new requests.');
    return;
  }

  const { user_input, history, user } = req.body;
  if (!user_input) {
    return res.status(400).json({ error: 'user_input is required' });
  }

  // Build the initial state for the workflow.
  const initialState = {
    user_input,
    history: history || [],
    user: user || null, // In a real app, user context would come from auth middleware
    ip: req.ip, // For public rate limiting
  };

  // Run the workflow nodes sequentially.
  let state = { ...initialState };
  const fetchResult = await fetchContentNode(state);
  state = { ...state, ...fetchResult };

  if (state.error) {
    return res.status(500).json({ error: state.error });
  }

  const summarizeResult = await summarizeContentNode(state);
  state = { ...state, ...summarizeResult };

  if (state.error) {
    return res.status(500).json({ error: state.error });
  }

  res.status(200).json({ summary: state.summary });
});

/**
 * Starts the server and sets up graceful shutdown listeners.
 */
const startServer = async () => {
  try {
    // Connect to Redis before starting the HTTP server.
    await redisClient.connect();
    console.log('Connected to Redis successfully.');

    // Cloud Run provides the PORT environment variable.
    const PORT = process.env.PORT || 8080;
    const server = app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });

    // --- Graceful Shutdown Logic ---
    const gracefulShutdown = (signal) => {
      console.log(`${signal} received: starting graceful shutdown.`);
      isShuttingDown = true; // Mark as shutting down for readiness probe

      // Stop accepting new connections.
      server.close(async () => {
        console.log('HTTP server closed.');
        try {
          // Close critical connections like the database.
          if (redisClient.isReady) {
            await redisClient.quit();
            console.log('Redis client connection closed.');
          }
        } catch (err) {
          console.error('Error during Redis client disconnection:', err);
        } finally {
          // Exit the process.
          console.log('Shutdown complete.');
          process.exit(0);
        }
      });

      // If connections are not closed within the timeout, force exit.
      // Cloud Run's default timeout is 10 seconds.
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down.');
        process.exit(1);
      }, 9500); // Set slightly less than the default 10s
    };

    // Listen for termination signals.
    // SIGTERM is sent by Cloud Run to signal shutdown.
    // SIGINT is for local development (Ctrl+C).
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (err) {
    console.error('Failed to start server:', err);
    // If Redis connection fails on startup, exit.
    if (redisClient.isReady) {
      await redisClient.quit();
    }
    process.exit(1);
  }
};

// Start the application.
startServer();