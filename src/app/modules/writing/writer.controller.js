import { writingAssistantApp } from './writing_assistant/workflow.js';

const writingTask = async (req, res) => {
  const { message, conversationId } = req.body;
  if (!message) {
    return res
      .status(400)
      .json({ error: 'Message and conversationId are required.' });
  }

  try {
    const inputs = { initialTopic: message, userInput: message };
    const result = await writingAssistantApp.invoke(inputs, {
      configurable: { thread_id: conversationId },
    });
    const thread_id = conversationId || generateConversationId();
    // Handle streaming for the final content
    if (result.finalContent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const stream = result.finalContent;
      let fullResponse = '';
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const chunk = event.delta.text;
          fullResponse += chunk;
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
      }
      // Save the final content to memory
      // await writingAssistantApp.invoke({ history: [{ role: 'assistant', content: fullResponse }] }, { configurable: { thread_id: thread_id } });
      res.end();
    } else {
      // If not streaming, send the conversational response
      res.json({
        responseMessage: result.responseMessage,
        thread_id: thread_id,
      });
    }
  } catch (error) {
    console.error('Writing Assistant Error:', error);
    res.status(500).json({ error: 'An internal error occurred.' });
  }
};

const generateConversationId = () => {
  // Generate a unique conversation ID, e.g., using a UUID or timestamp
  return `conv-${Date.now()}`;
};

export default writingTask;
