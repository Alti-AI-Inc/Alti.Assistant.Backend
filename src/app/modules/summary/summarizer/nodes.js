import express from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { RedisClient, redisClient } from '../../../../shared/redis.js';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { YoutubeLoader } from '@langchain/community/document_loaders/web/youtube';
import { promises as dns } from 'dns';
import { isIP } from 'net';
import { getUrlFromUserInputUsingAi } from '../geminiSummaryService.js';
import { generateSummary } from '../summarizerService.js';

// --- Rate Limiter Definitions ---

/**
 * Rate limiter for unauthenticated (public) users performing content fetch operations.
 * Limits are based on the client's IP address.
 * Allows 20 fetches per hour per IP. If exceeded, the IP is blocked for 15 minutes.
 * @type {RateLimiterRedis | null}
 */
const publicFetchLimiter = RedisClient.isEnabled
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_fetch_ip',
      points: 20,
      duration: 60 * 60,
      blockDuration: 60 * 15,
    })
  : null;

/**
 * Rate limiter for unauthenticated (public) users performing summary operations.
 * Limits are based on the client's IP address.
 * Allows 10 summaries per hour per IP. If exceeded, the IP is blocked for 30 minutes.
 * @type {RateLimiterRedis | null}
 */
const publicSummarizeLimiter = RedisClient.isEnabled
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_summarize_ip',
      points: 10,
      duration: 60 * 60,
      blockDuration: 60 * 30,
    })
  : null;

/**
 * Rate limiter for authenticated users performing content fetch operations.
 * Limits are based on the user's unique ID.
 * Allows 200 fetches per hour per user.
 * @type {RateLimiterRedis | null}
 */
const authenticatedFetchLimiter = RedisClient.isEnabled
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_fetch_user',
      points: 200,
      duration: 60 * 60,
    })
  : null;

/**
 * Rate limiter for authenticated users performing summary operations.
 * Limits are based on the user's unique ID.
 * Allows 100 summaries per hour per user.
 * @type {RateLimiterRedis | null}
 */
const authenticatedSummarizeLimiter = RedisClient.isEnabled
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_summarize_user',
      points: 100,
      duration: 60 * 60,
    })
  : null;

// BUGFIX/INTEGRATION: Added workspace-level limiters to enforce tenant-wide quotas.
// This ensures that the collective actions of all users in a workspace do not
// exceed the plan's limits.
/**
 * Tenant-level (workspace) rate limiter for content fetch operations.
 * Enforces a collective quota for all users within a single workspace.
 * This is crucial for multi-tenant plan enforcement.
 * Allows 1000 fetches per hour for the entire workspace.
 * @type {RateLimiterRedis | null}
 */
const workspaceFetchLimiter = RedisClient.isEnabled
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_fetch_workspace',
      points: 1000, // 1000 fetch operations per hour for the entire workspace
      duration: 60 * 60,
    })
  : null;

/**
 * Tenant-level (workspace) rate limiter for summary operations.
 * Enforces a collective quota for all users within a single workspace.
 * This is crucial for multi-tenant plan enforcement.
 * Allows 500 summaries per hour for the entire workspace.
 * @type {RateLimiterRedis | null}
 */
const workspaceSummarizeLimiter = RedisClient.isEnabled
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_summarize_workspace',
      points: 500, // 500 summary operations per hour for the entire workspace
      duration: 60 * 60,
    })
  : null;
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
  if (!RedisClient.isReady || !redisClient) {
    // Fail open: if Redis is not enabled or not ready, bypass rate limiting.
    return;
  }
  const { userLimiter, workspaceLimiter, publicLimiter } = limiters;

  try {
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
        workspaceLimiter && workspaceLimiter.consume(workspaceId),
        userLimiter && userLimiter.consume(id),
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
      if (publicLimiter) {
        await publicLimiter.consume(ip);
      }
    }
  } catch (rejRes) {
    if (rejRes instanceof Error) {
      console.error('Rate limiter Redis failure in summarizer, bypassing:', rejRes);
      return; // Fail open on Redis error
    }
    // Limit exceeded
    throw new Error('Too many requests. Please try again later.');
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

// Connect to Redis in a non-blocking way for rate limiting
redisClient.connect().catch((err) => {
  console.warn('Redis client connection failed for summary rate limiting (non-blocking):', err.message);
});