export const aiClassificationState = {
  // The user's original input/message
  userInput: { value: null },
  
  // Classified app/service (e.g., "gmail", "github", "calendar", etc.)
  identifiedApp: { value: null },
  
  // Classified action (e.g., "send_email", "create_issue", "create_event", etc.)
  identifiedAction: { value: null },
  
  // Classification confidence score (0-1)
  confidence: { value: null },
  
  // Available tools for the identified app
  availableTools: { value: null },
  
  // Filtered tools relevant to the identified action
  relevantTools: { value: null },
  
  // Extracted parameters from user input
  extractedParameters: { value: null },
  
  // Tool execution result
  executionResult: { value: null },
  
  // Final response to user
  response: { value: null },
  
  // Error information if any
  error: { value: null },
  
  // Processing metadata
  metadata: { value: null },
  
  // Conversation history - accumulates over time
  history: { 
    value: (x, y) => {
      // If x is null/undefined, start with empty array
      if (!x) return y || [];
      // If y is null/undefined, return x
      if (!y) return x;
      // If both exist, merge them maintaining chronological order
      return [...x, ...y];
    },
    default: () => []
  },
  
  // User ID for personalized tool access
  userId: { value: null },
  
  // Connected accounts for the user
  connectedAccounts: { value: null },
  
  // Processing stage
  currentStage: { value: 'initial' }
};
