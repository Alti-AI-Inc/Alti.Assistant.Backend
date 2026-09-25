import { logger } from '../../../shared/logger.js';
import { MessageQueueService } from '../devops/queue.service.js';

export const GitHubWebhookService = {
  async handlePushEvent(payload) {
    logger.info(`[GitHub Webhook] Received push event for repo: ${payload.repository?.full_name}`);
    
    const commitIds = payload.commits?.map(c => c.id).join(', ');
    logger.info(`[GitHub Webhook] Commits detected: ${commitIds}`);
    
    // Trigger AST re-indexing in the background via Kafka
    logger.info(`[GitHub Webhook] Queuing AST Graph re-indexing job for workspace...`);
    await MessageQueueService.publish('ast_reindex', { 
      repoUrl: payload.repository?.clone_url,
      branch: payload.ref
    });
    
    return { success: true, action: 'queued_ast_reindex' };
  }
};
