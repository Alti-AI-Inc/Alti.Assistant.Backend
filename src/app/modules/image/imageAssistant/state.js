/**
 * Defines the state for our conversational graph.
 * This object is passed between nodes and holds the conversation's memory.
 */
export const graphState = {
  // The user's initial idea for the image. Stays constant for reference.
  initialPrompt: { value: null },

  // The evolving, detailed prompt that gets updated with user feedback. This is our "memory".
  refinedPrompt: {
    value: (x, y) => y, // Always take the new, updated version
    default: () => "",
  },

  // A list of clarifying questions to ask the user.
  questions: { value: null },

  // A structured log of the conversation for full context.
  conversationHistory: {
    value: (x, y) => x.concat(y),
    default: () => [],
  },

  // The user's most recent message.
  userResponse: { value: null },

  // The final compiled prompt for the image generator.
  finalPrompt: { value: null },

  // The URL or base64 data of the generated image.
  imageUrl: { value: null },

  // The message to send back to the user in the current turn.
  responseMessage: { value: null },
};
