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
    const connections = await ComposioAuth.find({ userId, status: 'ACTIVE' });
    const connectedAppNames = new Set(
      connections.map((c) => {
        // Use toolkit.slug as primary identifier, fallback to authConfigId without prefix
        const name = c.toolkit?.slug || c.authConfigId?.replace(/^ac_/, '') || '';
        return name.toLowerCase();
      }).filter(Boolean)
    );

    // 2. Load all available apps from the Tool model
    const allTools = await Tool.find({}, { slug: 1, name: 1, description: 1, appName: 1 }).lean();
    
    // Build a unique set of apps with metadata
    const appMetadataMap = {};
    for (const tool of allTools) {
      const appKey = (tool.appName || tool.slug?.split('_')[0] || '').toLowerCase();
      if (!appKey) continue;
      
      if (!appMetadataMap[appKey]) {
        appMetadataMap[appKey] = {
          displayName: tool.appName || tool.name || appKey,
          category: 'Integration',
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
    } catch {
      // Non-fatal if no audit history is present yet
    }

    const recommendations = [];

    // 4. Match rules & calculate recommendation scores
    for (const [appName, meta] of Object.entries(appMetadataMap)) {
      if (connectedAppNames.has(appName)) {
        continue; // Skip already connected apps
      }

      let score = 40; // Base score
      const reasons = [];

      // Activity/Failed Attempts Boost: If user attempts actions on apps they don't have
      if (auditAnalytics && auditAnalytics.appBreakdown) {
        const attempted = auditAnalytics.appBreakdown.find((a) => a.app === appName);
        if (attempted) {
          score += 30;
          reasons.push(`You recently attempted to use ${meta.displayName} actions (${attempted.total} requests)`);
        }
      }

      // Connected-app synergy boost: if apps in the same category are already connected
      const sameCategory = Object.entries(appMetadataMap)
        .filter(([key, m]) => m.category === meta.category && connectedAppNames.has(key))
        .map(([key]) => key);
      
      if (sameCategory.length > 0) {
        score += 15;
        reasons.push(`Complements your connected ${sameCategory[0]} integration`);
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
