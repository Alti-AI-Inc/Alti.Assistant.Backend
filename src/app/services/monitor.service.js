import { scraperService } from './scraper.service.js';
import Together from 'together-ai';
import crypto from 'crypto';

const TOGETHER = new Together({ apiKey: process.env.TOGETHER_API_KEY || 'TOGETHER_KEY' });

export class AphuraMonitorEngine {
  /**
   * SEMANTIC DOM MONITORING
   * Retrieves raw HTML via ZenRows God Mode, strips boilerplate, and uses an LLM to semantically compare
   * against the previous known state. Identifies exact human-readable changes instead of just line-diffs.
   */
  static async checkChanges(url, previousStateHash = null, previousSemanticState = null, options = {}) {
    const emit = options.onEvent || (() => {});
    
    emit('status', `Booting Aphura Monitor Engine for: ${url}`);
    emit('action', 'Engaging ZenRows Omni-Extractor God Mode to bypass WAFs and captchas...');

    const scrapeResult = await scraperService.extractGodMode(url, { cssSelector: options.cssSelector });
    
    if (!scrapeResult.success) {
      emit('error', `Extraction failed: ${scrapeResult.error}`);
      throw new Error(`Extraction failed: ${scrapeResult.error}`);
    }

    const rawData = scrapeResult.data;
    const currentHash = crypto.createHash('sha256').update(rawData).digest('hex');

    if (currentHash === previousStateHash) {
      emit('complete', 'No structural DOM changes detected.');
      return { changed: false, hash: currentHash, semanticState: previousSemanticState, changes: [] };
    }

    emit('action', 'DOM mutation detected. Distilling structural changes into Semantic Tree...');
    
    // Distill the raw DOM into a semantic summary
    const distillPrompt = `You are a web semantic engine. Convert the following extracted HTML/CSS/JSON into a concise list of core facts, prices, titles, or statuses. Ignore boilerplate and styling.\n\nRAW DATA:\n${rawData.substring(0, 15000)}`;
    const distillResponse = await TOGETHER.chat.completions.create({
      messages: [{ role: 'system', content: distillPrompt }],
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'
    });
    const currentSemanticState = distillResponse.choices[0].message.content;

    if (!previousSemanticState) {
      emit('complete', 'Initial baseline established.');
      return { changed: true, hash: currentHash, semanticState: currentSemanticState, changes: ["Initial Baseline Established"] };
    }

    emit('action', 'Executing Semantic Diffing Engine against previous baseline...');
    const diffPrompt = `Compare the PREVIOUS state with the CURRENT state. List EXACTLY what changed in simple bullet points. Focus on prices, stock, dates, or headlines. If nothing materially changed, output "NO_CHANGE".\n\nPREVIOUS:\n${previousSemanticState}\n\nCURRENT:\n${currentSemanticState}`;
    
    const diffResponse = await TOGETHER.chat.completions.create({
      messages: [{ role: 'system', content: diffPrompt }],
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'
    });
    
    const changes = diffResponse.choices[0].message.content;
    const hasSemanticChanges = !changes.includes('NO_CHANGE');

    emit('complete', hasSemanticChanges ? `Semantic changes detected: ${changes.split('\n').length} items.` : 'No material semantic changes detected.');

    return {
      changed: hasSemanticChanges,
      hash: currentHash,
      semanticState: currentSemanticState,
      changes: hasSemanticChanges ? changes : null
    };
  }
}
