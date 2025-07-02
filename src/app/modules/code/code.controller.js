import { codeAssistantApp } from "./code_assistant/workflow.js";

const codeTask = async (req, res) => {
  const { message, conversationId } = req.body;
  if (!message) {
    return res
      .status(400)
      .json({
        error: 'Message, conversationId, and history array are required.',
      });
  }
  try {
      // The history is no longer needed from the client.
      // The checkpointer will load it from MongoDB based on the thread_id.
      // We also update the state to include the user's input in the history.
      const inputs = {
          userInput: message, // The user's latest message
          history: [{ role: 'user', content: message }], // Add current message to history
      };
      
      const result = await codeAssistantApp.invoke(inputs, { configurable: { thread_id: conversationId } });
      
      res.json({ response: result.response });

    } catch (error) {
      console.error("Code Assistant Error:", error);
      res.status(500).json({ error: "An internal error occurred." });
    }
};

const generateConversationId = () => {
  // Generate a unique conversation ID, e.g., using a UUID or timestamp
  return `conv-${Date.now()}`;
};

export const codeController = {
  codeTask,
};
