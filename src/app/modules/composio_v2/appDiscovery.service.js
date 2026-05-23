import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ComposioAuth from './composio.model.js';
import { actionAuditService } from './actionAudit.service.js';
import { logger } from '../../../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DISMISSED_FILE = path.resolve('storage/ragsystem/telemetry/dismissed_apps.json');

const APP_METADATA = {
  gmail: { displayName: 'Gmail', category: 'Communication', description: 'Read, draft, and send emails automatically. Integrates flawlessly with Google Calendar and Slack.', setupDifficulty: 'Easy', synergies: ['googlecalendar', 'slack'], quickStartPrompt: 'Send a summary email of my action items to the team.' },
  googlecalendar: { displayName: 'Google Calendar', category: 'Productivity', description: 'Schedule meetings, view calendar events, and manage invitations dynamically.', setupDifficulty: 'Easy', synergies: ['gmail', 'googlemeet'], quickStartPrompt: 'Find a free slot tomorrow at 2 PM and schedule a sync.' },
  slack: { displayName: 'Slack', category: 'Communication', description: 'Post alerts, send direct messages, and query channels for real-time collaboration.', setupDifficulty: 'Easy', synergies: ['github', 'linear', 'gmail'], quickStartPrompt: 'Post a notification in the #operations channel when my task updates.' },
  github: { displayName: 'GitHub', category: 'Development', description: 'Track repositories, create issues, review pull requests, and monitor commits.', setupDifficulty: 'Easy', synergies: ['slack', 'linear'], quickStartPrompt: 'List all open issues assigned to me in the assistant repo.' },
  notion: { displayName: 'Notion', category: 'Productivity', description: 'Create rich text pages, update databases, and manage personal notes.', setupDifficulty: 'Easy', synergies: ['gmail', 'googlecalendar'], quickStartPrompt: 'Export my daily notes into a new Notion database page.' },
  linear: { displayName: 'Linear', category: 'Development', description: 'Create engineering tickets, assign tasks, and transition development workflows.', setupDifficulty: 'Easy', synergies: ['github', 'slack'], quickStartPrompt: 'Create a new bug ticket for the backend auth timeout.' },
  trello: { displayName: 'Trello', category: 'Productivity', description: 'Organize cards, update columns, and track work visually on boards.', setupDifficulty: 'Easy', synergies: ['slack', 'gmail'], quickStartPrompt: 'Add a new card to my Project board under In Progress.' },
  salesforce: { displayName: 'Salesforce', category: 'Business Ops', description: 'Access leads, query contacts, update deals, and generate sales summaries.', setupDifficulty: 'Medium', synergies: ['hubspot', 'gmail'], quickStartPrompt: 'Retrieve the contact details of the lead named Alexander.' },
  hubspot: { displayName: 'HubSpot', category: 'Business Ops', description: 'Track marketing pipelines, email lists, and customer relationships.', setupDifficulty: 'Easy', synergies: ['salesforce', 'slack'], quickStartPrompt: 'List my hot leads with deal sizes above $10,000.' },
  calendly: { displayName: 'Calendly', category: 'Productivity', description: 'Share scheduling links and configure automated calendar bookings.', setupDifficulty: 'Easy', synergies: ['googlecalendar', 'gmail'], quickStartPrompt: 'Generate a Calendly booking link for a 30-minute chat.' }
};

/**
 * Loads dismissed app list from local storage.
 */
const _loadDismissed = () => {
  try {
    if (fs.existsSync(DISMISSED_FILE)) {
      return JSON.parse(fs.readFileSync(DISMISSED_FILE, 'utf8'));
    }
  } catch (err) {
    logger.warn('AppDiscoveryService: could not read dismissed apps file:', err.message);
  }
  return [];
};

/**
 * Saves dismissed app list to disk.
 */
const _saveDismissed = (dismissedList) => {
  try {
    const dir = path.dirname(DISMISSED_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DISMISSED_FILE, JSON.stringify(dismissedList, null, 2));
  } catch (err) {
    logger.warn('AppDiscoveryService: could not write dismissed apps file:', err.message);
  }
};

/**
 * Generates intelligent recommendations based on connected accounts and active telemetry patterns.
 */
const getRecommendations = async (userId) => {
  try {
    // 1. Fetch currently connected accounts
    const connections = await ComposioAuth.find({ userId });
    const connectedAppNames = new Set(
      connections.map((c) => {
        // Match toolkit name or extract from authConfigId
        const name = c.authConfigId?.split('_')[0] || c.integrationId || '';
        return name.toLowerCase();
      })
    );

    // Load dismissed apps
    const dismissed = _loadDismissed();
    const dismissedSet = new Set(dismissed.map(app => app.toLowerCase()));

    // 2. Fetch recent action audit history to find what the user is attempting
    let auditAnalytics = null;
    try {
      auditAnalytics = await actionAuditService.getUserAnalytics(userId);
    } catch {
      // Non-fatal if no audit history is present yet
    }

    const recommendations = [];

    // 3. Match rules & calculate recommendation scores
    for (const [appName, meta] of Object.entries(APP_METADATA)) {
      if (connectedAppNames.has(appName) || dismissedSet.has(appName)) {
        continue; // Skip already connected or dismissed apps
      }

      let score = 50; // Base score (out of 100)
      const reasons = [];

      // Synergy Boost: Check if synergistic apps are connected
      let synergyCount = 0;
      for (const syn of meta.synergies) {
        if (connectedAppNames.has(syn)) {
          score += 15;
          synergyCount++;
          reasons.push(`Perfect synergy with your connected application: ${APP_METADATA[syn]?.displayName || syn}`);
        }
      }

      if (synergyCount > 0) {
        score += 5;
      }

      // Activity/Failed Attempts Boost: If user attempts actions on apps they don't have
      if (auditAnalytics && auditAnalytics.appBreakdown) {
        const attempted = auditAnalytics.appBreakdown.find((a) => a.app === appName);
        if (attempted) {
          score += 25;
          reasons.push(`You recently attempted to use ${meta.displayName} actions (${attempted.count} requests)`);
        }
      }

      // Default high-value triggers
      if (appName === 'gmail' && !connectedAppNames.has('gmail')) {
        score += 10;
        reasons.push('Central workspace hub for draft automation and status notifications');
      }

      // Cap at 98
      const confidence = Math.min(98, score) / 100;

      recommendations.push({
        appName,
        displayName: meta.displayName,
        category: meta.category,
        description: meta.description,
        setupDifficulty: meta.setupDifficulty,
        synergies: meta.synergies.map((s) => APP_METADATA[s]?.displayName || s),
        quickStartPrompt: meta.quickStartPrompt,
        confidence,
        reasons: reasons.length > 0 ? reasons : ['Boost your productivity with quick automated integration workflows'],
      });
    }

    // Sort by confidence descending
    recommendations.sort((a, b) => b.confidence - a.confidence);

    return {
      success: true,
      connectedAppsCount: connectedAppNames.size,
      recommendations: recommendations.slice(0, 3), // Return top 3 highly relevant suggestions
    };
  } catch (err) {
    logger.error('AppDiscoveryService error:', err);
    throw new Error(`Failed to generate integration recommendations: ${err.message}`);
  }
};

/**
 * Dismisses an app recommendation from the list.
 */
const dismissRecommendation = async (appName) => {
  const dismissed = _loadDismissed();
  if (!dismissed.includes(appName)) {
    dismissed.push(appName);
    _saveDismissed(dismissed);
  }
  return { success: true, message: `Recommendation for "${appName}" dismissed.` };
};

export const appDiscoveryService = {
  getRecommendations,
  dismissRecommendation,
};
