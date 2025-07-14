import { researchAgentApp } from "./search_assistant/workflow.js";

export const searchController = async (req, res) => {
    const { message, conversationId } = req.body;
    if (!conversationId || !message) {
      return res.status(400).json({ error: "A query and conversationId are required." });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        const inputs = { 
            query: message,
            history: [{ role: 'user', content: message }],
        };
        const result = await researchAgentApp.invoke(inputs, { configurable: { thread_id: conversationId } });
        console.log("Research Assistant Result:", result);
        
        const stream = result.answer;
        let fullResponse = "";
        // console.log("Received stream from research agent:", stream, typeof stream);
        if (typeof stream === 'string') {
            res.write(`data: ${JSON.stringify({ chunk: stream })}\n\n`);
        } else {
            for await (const event of stream) {
                if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                    const chunk = event.delta.text;
                    fullResponse += chunk;
                    res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
                }
            }
            await researchAgentApp.invoke({ history: [{ role: 'assistant', content: fullResponse }] }, { configurable: { thread_id: conversationId } });
        }
    } catch (error) {
      console.error("Research Assistant Error:", error);
      res.write(`data: ${JSON.stringify({ error: "An internal error occurred." })}\n\n`);
    } finally {
      res.end();
    }
  }