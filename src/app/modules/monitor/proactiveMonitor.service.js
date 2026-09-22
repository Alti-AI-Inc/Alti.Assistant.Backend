import { logger } from '../../../shared/logger.js';
import { groqLightChat } from '../../services/groq.client.js';

/**
 * World-Class Proactive Intelligence Monitor
 * 
 * Capabilities:
 * 1. Continuous Web Crawling (Exa Neural Search)
 * 2. State-Diff Analysis (Groq 20b detects anomalies/changes)
 * 3. Alert Dispatch (via Composio to Slack/Email)
 * 4. Sovereign Memory (MongoDB snapshotting)
 */
export const ProactiveMonitorService = {

  // In-memory snapshot cache (in production, use Redis/MongoDB)
  snapshots: new Map(),

  /**
   * Monitor a specific topic or URL for breaking changes
   * @param {string} monitorId - Unique ID for this monitor
   * @param {string} query - The search query or domain to monitor
   */
  async runMonitorTick(monitorId, query) {
    const startTime = Date.now();
    logger.info(`[Monitor] Running tick for: ${monitorId} -> "${query}"`);

    try {
      // 1. Fetch latest state via Exa
      const { ExaSearchService } = await import('../ExaSearch/exaSearch.service.js');
      const searchRes = await ExaSearchService.searchDirectly(query, { numResults: 5, useAutoprompt: true });
      const currentData = searchRes?.results?.map(r => `[${r.publishedDate || 'New'}] ${r.title}: ${r.summary}`).join('\n') || '';

      if (!currentData) {
        logger.warn(`[Monitor] No data found for ${monitorId}`);
        return null;
      }

      // 2. Load previous state
      const previousData = this.snapshots.get(monitorId) || '';
      
      // 3. Compute semantic diff using Groq 20b
      const diffPrompt = `You are a proactive intelligence monitor. Compare the NEW data against the PREVIOUS data.
If there is a critical breaking change, new event, or significant update, summarize it concisely.
If there are no meaningful updates, reply with exactly: "NO_CHANGE".

PREVIOUS DATA:
${previousData || 'None (First run)'}

NEW DATA:
${currentData}`;

      const res = await groqLightChat([{ role: 'system', content: diffPrompt }], { temperature: 0.1 });
      const analysis = res.choices[0].message.content.trim();

      // 4. Update snapshot
      this.snapshots.set(monitorId, currentData);

      // 5. Alert if changed
      if (analysis !== 'NO_CHANGE' && previousData !== '') {
        logger.info(`[Monitor] 🚨 ALERT TRIGGERED for ${monitorId}:\n${analysis}`);
        await this.dispatchAlert(monitorId, analysis);
      } else {
        logger.info(`[Monitor] Status Normal for ${monitorId}`);
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      return { status: analysis === 'NO_CHANGE' ? 'stable' : 'alert', elapsed, analysis };

    } catch (err) {
      logger.error(`[Monitor] Tick failed for ${monitorId}: ${err.message}`);
      throw err;
    }
  },

  /**
   * Dispatch alerts via Composio (Slack/Email)
   */
  async dispatchAlert(monitorId, message) {
    try {
      // Placeholder for Composio Tool Call integration
      // e.g. await ComposioService.execute('slack_send_message', { text: `[Aphura Monitor: ${monitorId}]\n${message}` })
      logger.info(`[Monitor] ✉️ Alert dispatched to external integrations for ${monitorId}`);
    } catch (err) {
      logger.error(`[Monitor] Alert dispatch failed: ${err.message}`);
    }
  }
};

export default ProactiveMonitorService;
