import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { logger } from '../../../shared/logger.js';

/**
 * LangChain SSE Streaming Callback Handler
 * Bridges LangChain's callback system with our SSE event stream.
 * Pass this handler to any chain/agent to get real-time token streaming.
 */
export class SSECallbackHandler extends BaseCallbackHandler {
  name = 'SSECallbackHandler';

  constructor(emitter) {
    super();
    this.emitter = emitter; // function(event) that writes to SSE stream
  }

  handleLLMStart(llm, prompts) {
    this.emitter({ type: 'metadata', status: 'thinking...' });
  }

  handleLLMNewToken(token) {
    if (token) {
      this.emitter({ type: 'text', content: token });
    }
  }

  handleLLMEnd(output) {
    // LLM generation finished
  }

  handleLLMError(err) {
    logger.error(`[SSECallback] LLM error: ${err.message}`);
    this.emitter({ type: 'text', content: `\n\n*Error: ${err.message}*` });
  }

  handleChainStart(chain) {
    const name = chain?.id?.[chain.id.length - 1] || 'chain';
    this.emitter({ type: 'metadata', status: `running ${name}...` });
  }

  handleChainEnd(outputs) {
    // Chain finished
  }

  handleChainError(err) {
    logger.error(`[SSECallback] Chain error: ${err.message}`);
  }

  handleToolStart(tool, input) {
    const name = tool?.id?.[tool.id.length - 1] || 'tool';
    this.emitter({ type: 'metadata', status: `using ${name}...` });
  }

  handleToolEnd(output) {
    // Tool execution finished
  }

  handleToolError(err) {
    logger.error(`[SSECallback] Tool error: ${err.message}`);
  }

  handleAgentAction(action) {
    this.emitter({
      type: 'metadata',
      status: `calling ${action.tool}...`,
      tool: action.tool,
      input: action.toolInput,
    });
  }

  handleAgentEnd(result) {
    // Agent loop finished
  }

  handleRetrieverStart(retriever) {
    this.emitter({ type: 'metadata', status: 'searching documents...' });
  }

  handleRetrieverEnd(documents) {
    this.emitter({
      type: 'metadata',
      status: `found ${documents.length} documents`,
      documentCount: documents.length,
    });
  }
}

/**
 * Creates a streaming callback handler for SSE responses.
 * Usage:
 *   const { handler, emitter } = createStreamingCallback(res);
 *   await chain.invoke(input, { callbacks: [handler] });
 */
export function createStreamingCallback(res) {
  const emitter = (event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (e) {
      // Connection closed
    }
  };

  return {
    handler: new SSECallbackHandler(emitter),
    emitter,
  };
}

export default SSECallbackHandler;
