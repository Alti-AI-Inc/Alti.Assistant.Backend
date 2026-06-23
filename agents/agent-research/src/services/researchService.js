import { GoogleGenAI } from '@google/genai';
import config from '../../../../shared/config/index.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('researchService');

class ResearchService {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    this.proModel = 'gemini-2.5-pro';
    this.flashModel = 'gemini-3.5-flash';
  }

  async callModel(model, prompt, options = {}) {
    logger.info(`Calling model ${model} with grounding`);
    try {
      const result = await this.ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: options.temperature || 0.3,
          maxOutputTokens: options.maxTokens || 8192,
          tools: [{ googleSearch: {} }]
        }
      });
      const text = result.candidates?.[0]?.content?.parts?.filter(p => p.text)?.map(p => p.text)?.join('');
      return text;
    } catch (err) {
      logger.error('Error in callModel:', err);
      throw err;
    }
  }

  async initializeResearch(topic) {
    logger.info('Initializing research');
    const res = await this.callModel(this.flashModel, `Create a research plan for: ${topic}. List 3 key questions and 5 search terms. Output JSON.`);
    return { plan: res };
  }

  async breadthSearch(topic, searchTerms) {
    logger.info('Performing breadth search');
    const res = await this.callModel(this.flashModel, `Perform a broad search on ${topic} using terms: ${searchTerms}. Summarize findings.`);
    return [res];
  }

  async identifyLeads(breadthResults) {
    logger.info('Identifying leads');
    const res = await this.callModel(this.proModel, `Analyze these findings and extract the most promising leads: ${breadthResults.join('\\n')}`);
    return [res];
  }

  async deepDive(leads) {
    logger.info('Performing deep dive on leads');
    const results = [];
    for (const lead of leads) {
      const res = await this.callModel(this.proModel, `Perform an in-depth analysis on this lead: ${lead}`);
      results.push(res);
    }
    return results;
  }

  async synthesizeReport(deepDiveResults, topic) {
    logger.info('Synthesizing report');
    const res = await this.callModel(this.proModel, `Write a comprehensive research report on ${topic} based on these deep dive findings: ${deepDiveResults.join('\\n')}. Use markdown.`);
    return res;
  }

  async boardDebate(synthesis) {
    logger.info('Simulating board debate');
    const res = await this.callModel(this.proModel, `Simulate a debate among domain experts critiquing this report: ${synthesis}. Identify gaps or flaws.`);
    return res;
  }

  async refineSynthesis(synthesis, debateResults) {
    logger.info('Refining synthesis based on debate');
    const res = await this.callModel(this.proModel, `Refine this report: ${synthesis} based on this critique: ${debateResults}. Produce the final polished markdown report.`);
    return res;
  }

  async saveResearch(report, userId) {
    logger.info('Saving research to database');
    return { savedId: 'mock-saved-id' };
  }

  async generatePdf(report) {
    logger.info('Generating PDF for report');
    return { pdfUrl: 'https://storage.googleapis.com/placeholder-bucket/reports/report.pdf' };
  }
}

export default new ResearchService();
