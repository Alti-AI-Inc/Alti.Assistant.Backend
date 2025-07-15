import { researchAgentApp } from "./search_assistant/workflow.js";

export const searchController = async (req, res) => {
    const { message, conversationId } = req.body;
    if (!message) {
        return res.status(400).json({ error: "A query is required." });
    }
    
    const thread_id = conversationId || generateConversationId();

    try {
        const inputs = { 
            query: message,
            history: [{ role: 'user', content: message }],
        };
        const result = await researchAgentApp.invoke(inputs, { configurable: { thread_id: thread_id } });
        console.log("Research Assistant Result:", result);
        
        const stream = result.answer;
        let fullResponse = "";

        if (typeof stream === 'string') {
            // If the stream is a string, send it directly as a JSON response
            fullResponse = stream;
            return res.json({ responseMessage: fullResponse, thread_id: thread_id });
        } else {
            // Set up SSE headers only when streaming
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            for await (const event of stream) {
                if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                    const chunk = event.delta.text;
                    fullResponse += chunk;
                    res.write(`data: ${JSON.stringify({ chunk, thread_id })}\n\n`);
                }
            }
            
            // Send final message with complete response
            res.write(`data: ${JSON.stringify({ complete: true, fullResponse, thread_id })}\n\n`);
            res.end();
        }
    } catch (error) {
        console.error("Research Assistant Error:", error);
        
        // Check if headers have already been sent
        if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: "An internal error occurred." })}\n\n`);
            res.end();
        } else {
            res.status(500).json({ error: "An internal error occurred.", thread_id });
        }
    }
};

const generateConversationId = () => {
    // Generate a unique conversation ID, e.g., using a UUID or timestamp
    return `conv-${Date.now()}`;
};