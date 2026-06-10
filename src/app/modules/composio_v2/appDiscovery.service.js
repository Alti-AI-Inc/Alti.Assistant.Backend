import ComposioAuth from './composio.model.js';
import Tool from './tools.model.js';
// FIX: Import a model for storing user preferences like dismissed recommendations.
// This makes dismissals persistent and user-specific.
import UserPreference from '../user/userPreference.model.js';
import { actionAuditService } from './actionAudit.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Generates intelligent recommendations based on connected accounts and active telemetry patterns.
 * Dynamically loads all available apps from the Tool model instead of hardcoding a small subset.
 *
 * SECURITY & INTEGRATION FIX: This function now requires a userContext object containing userId and workspaceId
 * to ensure all data access is properly scoped to the user's tenant, preventing data leakage and IDOR vulnerabilities.
 * @param {object} userContext - The authenticated user's context.
 * @param {string} userContext.userId - The ID of the user.
 * @param {string} userContext.workspaceId - The ID of the user's workspace/tenant.
 */
const getRecommendations = async (userContext) => {
  // SECURITY: Enforce presence of userId and workspaceId from a trusted context (e.g., JWT middleware).
  const { userId, workspaceId } = userContext;
  if (!userId || !workspaceId) {
    logger.error('AppDiscoveryService: getRecommendations called without full userContext.');
    throw new Error('User context with userId and workspaceId is required.');
  }

  try {
    // INTEGRATION: Fetch user preferences to exclude dismissed recommendations.
    const userPreferences = await UserPreference.findOne({ userId }).lean();
    const dismissedAppNames = new Set(userPreferences?.dismissedRecommendations || []);

    // 1. Fetch currently ACTIVE connected accounts for the specific user within their workspace.
    // SECURITY FIX: Query is now scoped by both userId and workspaceId to enforce tenant boundaries.
    // This assumes the ComposioAuth model has a `workspaceId` field.
    const connections = await ComposioAuth.find({ userId, workspaceId, status: 'ACTIVE' }).lean();
    const connectedAppNames = new Set(
      connections.map((c) => {
        const name = c.toolkit?.slug || c.authConfigId?.replace(/^ac_/, '') || '';
        return name.toLowerCase();
      }).filter(Boolean)
    );

    // INTEGRATION: Fetch apps connected by other users in the same workspace for synergy calculation.
    const workspaceConnections = await ComposioAuth.find({
      workspaceId,
      userId: { $ne: userId },
      status: 'ACTIVE',
    }).lean();
    const workspaceConnectedAppNames = new Set(
      workspaceConnections.map((c) => {
        const name = c.toolkit?.slug || c.authConfigId?.replace(/^ac_/, '') || '';
        return name.toLowerCase();
      }).filter(Boolean)
    );

    // 2. Load all available apps from the Tool model
    const allTools = await Tool.find({}, { slug: 1, name: 1, description: 1, appName: 1, category: 1 }).lean();

    const appMetadataMap = {};
    for (const tool of allTools) {
      const appKey = (tool.slug?.split('_')[0] || tool.appName || '').toLowerCase();
      if (!appKey) continue;

      if (!appMetadataMap[appKey]) {
        appMetadataMap[appKey] = {
          displayName: tool.appName || tool.name || appKey,
          category: tool.category || 'Integration',
          description: tool.description || `Automate workflows with ${tool.appName || appKey}`,
          setupDifficulty: 'Easy',
          actions: [],
        };
      }
      if (tool.slug) {
        appMetadataMap[appKey].actions.push(tool.slug);
      }
    }

    // 3. Fetch recent action audit history to find what the user is attempting
    let auditAnalytics = null;
    try {
      // INTEGRATION FIX: Pass workspaceId to the analytics service to ensure it respects tenant boundaries.
      auditAnalytics = await actionAuditService.getUserAnalytics(userId, workspaceId);
    } catch (error) {
      logger.warn(`AppDiscoveryService: No audit history found or error fetching for user ${userId} in workspace ${workspaceId}: ${error.message}`);
    }

    let appBreakdownMap = new Map();
    if (auditAnalytics && auditAnalytics.appBreakdown) {
      for (const item of auditAnalytics.appBreakdown) {
        appBreakdownMap.set(item.app, item);
      }
    }

    const recommendations = [];
    const connectedAppCategories = new Set();
    for (const appName of connectedAppNames) {
      if (appMetadataMap[appName]) {
        connectedAppCategories.add(appMetadataMap[appName].category);
      }
    }

    // 4. Match rules & calculate recommendation scores
    for (const [appName, meta] of Object.entries(appMetadataMap)) {
      // BUG FIX: Skip already connected apps AND apps the user has explicitly dismissed.
      if (connectedAppNames.has(appName) || dismissedAppNames.has(appName)) {
        continue;
      }

      let score = 30; // Base score
      const reasons = [];

      // Activity/Failed Attempts Boost
      if (appBreakdownMap.size > 0) {
        const attempted = appBreakdownMap.get(appName);
        if (attempted) {
          score += 30;
          reasons.push(`You recently attempted to use ${meta.displayName} actions (${attempted.total} requests)`);
        }
      }

      // Connected-app synergy boost
      if (connectedAppCategories.has(meta.category)) {
        score += 15;
        reasons.push(`Complements other connected integrations in the same category`);
      }

      // INTEGRATION: Workspace Synergy Boost - recommend apps popular with the user's team.
      if (workspaceConnectedAppNames.has(appName)) {
        score += 20;
        reasons.push(`Popular within your workspace`);
      }

      // High-value app boost
      const highValueApps = ['gmail', 'slack', 'github', 'notion', 'googlecalendar', 'salesforce', 'hubspot'];
      if (highValueApps.includes(appName)) {
        score += 10;
        reasons.push('Popular high-value integration');
      }

      const confidence = Math.min(98, score) / 100;

      recommendations.push({
        appName,
        displayName: meta.displayName,
        category: meta.category,
        description: meta.description,
        setupDifficulty: meta.setupDifficulty,
        actionCount: meta.actions.length,
        confidence,
        reasons: reasons.length > 0 ? reasons : ['Boost your productivity with automated integration workflows'],
      });
    }

    recommendations.sort((a, b) => b.confidence - a.confidence);

    return {
      success: true,
      connectedAppsCount: connectedAppNames.size,
      totalAvailableApps: Object.keys(appMetadataMap).length,
      recommendations: recommendations.slice(0, 5),
    };
  } catch (err) {
    logger.error(`AppDiscoveryService error for user ${userId} in workspace ${workspaceId}:`, err);
    throw new Error(`Failed to generate integration recommendations: ${err.message}`);
  }
};

/**
 * Dismisses an app recommendation, storing the preference in the database.
 *
 * SECURITY & INTEGRATION FIX: This function now requires a userContext object to ensure
 * a user can only modify their own preferences.
 * @param {string} appName - The name of the app to dismiss.
 * @param {object} userContext - The authenticated user's context.
 * @param {string} userContext.userId - The ID of the user.
 */
const dismissRecommendation = async (appName, userContext) => {
  // SECURITY: Enforce presence of userId from a trusted context.
  const { userId } = userContext;
  if (!userId) {
    logger.error('AppDiscoveryService: dismissRecommendation called without userId.');
    throw new Error('User context with userId is required.');
  }

  try {
    // BUG FIX: Persist the dismissal in the database instead of just logging.
    // This uses an atomic $addToSet operation to prevent duplicates.
    await UserPreference.findOneAndUpdate(
      { userId },
      { $addToSet: { dismissedRecommendations: appName } },
      { upsert: true, new: true }
    );
    logger.info(`AppDiscoveryService: user ${userId} dismissed recommendation for ${appName}`);
    return { success: true, message: `Recommendation for "${appName}" dismissed.` };
  } catch (error) {
    logger.error(`Failed to dismiss recommendation for user ${userId}:`, error);
    throw new Error('Could not save dismissal preference.');
  }
};

export const appDiscoveryService = {
  getRecommendations,
  dismissRecommendation,
};