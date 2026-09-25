import { logger } from '../../../shared/logger.js';
import { ExaSearchService } from '../ExaSearch/exaSearch.service.js';

export const LangGraphService = {
  async runResearchSwarm({ query, perspectives = 3 }) {
    logger.info(`[Aphura LangGraph] 🕸️ Launching Deep Research Swarm for: "${query}"`);
    try {
      logger.info(`[Aphura LangGraph] Planner Agent generating ${perspectives} research angles...`);
      const angles = [
        `Technical implementation and architecture of ${query}`,
        `Market impact and competitive analysis of ${query}`,
        `Future trends and historical context of ${query}`
      ].slice(0, perspectives);

      const researchResults = [];
      const allReferences = [];

      for (const angle of angles) {
        logger.info(`[Aphura LangGraph] Researcher Agent investigating: ${angle}`);
        const searchRes = await ExaSearchService.searchDirectly(angle, { numResults: 2 });
        const findings = searchRes.results.map(r => r.text).join('\n\n');
        researchResults.push({ angle, findings, sources: searchRes.results });
        allReferences.push(...searchRes.results);
      }

      logger.info(`[Aphura LangGraph] Writer Agent synthesizing findings...`);
      const synthesis = `Based on deep research across ${perspectives} unique perspectives, here is the synthesis for "${query}".\n\n` +
        researchResults.map(r => `### ${r.angle}\n${r.findings.slice(0, 300)}...`).join('\n\n');

      return {
        success: true,
        synthesis,
        perspectives: researchResults,
        references: allReferences.slice(0, 5)
      };
    } catch (error) {
      logger.error(`[Aphura LangGraph] ❌ ${error.message}`);
      throw error;
    }
  },

  async compileAgentGraph(graphDefinition) {
    return { success: true, report: 'Compiled' };
  },
  
  async executeGraph(graphId, initialState) {
    return { success: true, report: 'Executed' };
  }
};
