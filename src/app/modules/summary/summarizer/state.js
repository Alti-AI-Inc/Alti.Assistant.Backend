export const summarizerState = {
  // The URL provided by the user.
  user_input: { value: null },

  // The text content extracted from the URL.
  content: { value: null },

  // The final summary stream/object.
  summary: { value: null },

  // Conversation history for context.
  history: { value: (x, y) => x.concat(y), default: () => [] },

  isFilePassed: { value: null },
};
