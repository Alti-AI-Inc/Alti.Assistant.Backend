import { ExaSearchService } from '../../ExaSearch/exaSearch.service.js';
import { groqChat } from '../../../services/groq.client.js';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Execute search strategy.
 * @param {Object} params
 * @param {Object} context
 */
export async function execute({ query, options }, context = {}) {
  try {
    const results = await ExaSearchService.searchDirectly(query, options);
    let synthesis = null;

    if (context.synthesize) {
      const allMessages = [
        { role: 'system', content: 'Synthesize the search results based on the query.' },
        { role: 'user', content: `Query: ${query}\nResults: ${JSON.stringify(results)}` }
      ];
      const response = await groqChat(allMessages, { model: config.groq?.model || 'gpt-oss-120b' });
      synthesis = response.choices?.[0]?.message?.content || '';
    }

    return { route: 'SEARCH', results, synthesis };
  } catch (error) {
    logger.error('Error in searchStrategy', error);
    throw error;
  }
}
