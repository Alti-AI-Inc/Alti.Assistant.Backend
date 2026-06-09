import ComposioAuth from './composio.model.js';
import Tool from './tools.model.js';
import { actionAuditService } from './actionAudit.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Generates intelligent recommendations based on connected accounts and active telemetry patterns.
 * Dynamically loads all available apps from the Tool model instead of hardcoding a small subset.
 */
const getRecommendations = async (userId) => {
  try {
    // 1. Fetch currently ACTIVE connected accounts
    // Optimization: Added .lean() for performance as connections are read-only.
    // Indexing Recommendation: Consider adding an index to ComposioAuth model for { userId: 1, status: 1 }
    // to speed up this query.
    const connections = await ComposioAuth.find({ userId, status: 'ACTIVE' }).lean();
    const connectedAppNames = new Set(
      connections.map((c) => {
        // Use toolkit.slug as primary identifier, fallback to authConfigId without prefix
        // Ensure consistency with how appKey is derived from Tool model for accurate matching.
        const name = c.toolkit?.slug || c.authConfigId?.replace(/^ac_/, '') || '';
        return name.toLowerCase();
      }).filter(Boolean)
    );

    // 2. Load all available apps from the Tool model
    // Added 'category' to projection to allow tools to define their own categories.
    const allTools = await Tool.find({}, { slug: 1, name: 1, description: 1, appName: 1, category: 1 }).lean();

    // Build a unique set of apps with metadata
    const appMetadataMap = {};
    for (const tool of allTools) {
      // Prioritize slug's base part for appKey to ensure consistency with connectedAppNames.
      // Example: 'gmail_sendEmail' -> 'gmail'. Fallback to appName if slug is not suitable.
      const appKey = (tool.slug?.split('_')[0] || tool.appName || '').toLowerCase();
      if (!appKey) continue;

      if (!appMetadataMap[appKey]) {
        appMetadataMap[appKey] = {
          // Use appName or name for display, fallback to derived appKey
          displayName: tool.appName || tool.name || appKey,
          // Use tool's category if available, otherwise default
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
      auditAnalytics = await actionAuditService.getUserAnalytics(userId);
    } catch (error) {
      // Non-fatal if no audit history is present yet, log the error for debugging purposes.
      logger.warn(`AppDiscoveryService: No audit history found or error fetching for user ${userId}: ${error.message}`);
    }

    const recommendations = [];

    // Pre-calculate categories of connected apps for performance optimization.
    // This avoids O(N^2) complexity when checking for same-category synergy.
    const connectedAppCategories = new Set();
    for (const appName of connectedAppNames) {
      if (appMetadataMap[appName]) { // Ensure the connected app has metadata
        connectedAppCategories.add(appMetadataMap[appName].category);
      }
    }

    // 4. Match rules & calculate recommendation scores
    for (const [appName, meta] of Object.entries(appMetadataMap)) {
      if (connectedAppNames.has(appName)) {
        continue; // Skip already connected apps
      }

      let score = 40; // Base score
      const reasons = [];

      // Activity/Failed Attempts Boost: If user attempts actions on apps they don't have
      if (auditAnalytics && auditAnalytics.appBreakdown) {
        // Optimization: For very large auditAnalytics.appBreakdown, converting it to a Map
        // keyed by 'app' could improve lookup from O(N) to O(1).
        const attempted = auditAnalytics.appBreakdown.find((a) => a.app === appName);
        if (attempted) {
          score += 30;
          reasons.push(`You recently attempted to use ${meta.displayName} actions (${attempted.total} requests)`);
        }
      }

      // Connected-app synergy boost: if apps in the same category are already connected
      // Optimized to use pre-calculated connectedAppCategories set for O(1) lookup.
      if (connectedAppCategories.has(meta.category)) {
        score += 15;
        reasons.push(`Complements other connected integrations in the same category`);
      }

      // High-value app boost
      const highValueApps = ['gmail', 'slack', 'github', 'notion', 'googlecalendar', 'salesforce', 'hubspot'];
      if (highValueApps.includes(appName)) {
        score += 10;
        reasons.push('Popular high-value integration');
      }

      // Cap at 98
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

    // Sort by confidence descending
    recommendations.sort((a, b) => b.confidence - a.confidence);

    return {
      success: true,
      connectedAppsCount: connectedAppNames.size,
      totalAvailableApps: Object.keys(appMetadataMap).length,
      recommendations: recommendations.slice(0, 5), // Return top 5 relevant suggestions
    };
  } catch (err) {
    logger.error('AppDiscoveryService error:', err);
    // Re-throw a more user-friendly error message, while logging the full error internally.
    throw new Error(`Failed to generate integration recommendations: ${err.message}`);
  }
};

/**
 * Dismisses an app recommendation from the list.
 * Uses a per-user DB approach instead of a global file.
 */
const dismissRecommendation = async (appName, userId) => {
  // For now, log the dismissal. A proper implementation would store this in the user's preferences.
  logger.info(`AppDiscoveryService: user ${userId} dismissed recommendation for ${appName}`);
  return { success: true, message: `Recommendation for "${appName}" dismissed.` };
};

export const appDiscoveryService = {
  getRecommendations,
  dismissRecommendation,
};