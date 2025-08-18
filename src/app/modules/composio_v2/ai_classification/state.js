export const aiClassificationState = {
  // The user's original input/message
  userInput: { value: null },
  
  // List of available apps from database
  availableApps: { value: null },
  
  // List of available actions for the identified app from database
  availableActions: { value: null },
  
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

  finalResponse: { value: null },

  workflowType: { value: null },

  // Multi-step workflow fields
  executionPlan: { value: null },           // Array of planned steps
  currentStep: { value: 0 },                // Current execution step index
  stepResults: { value: [] },               // Results from completed steps
  stepSummaries: { value: null },             // Summaries of completed steps for context
  dependencyGraph: { value: null },         // Step dependencies and data flow
  planningMetadata: { value: null },        // Planning context and reasoning
  requiredApps: { value: null },            // All apps identified for the workflow
  crossStepParameters: { value: {} },       // Parameters that flow between steps
  workflowComplete: { value: false },       // Flag to indicate workflow completion

  // Conversation history - accumulates over time with proper memory management
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

  // Current conversation messages (current turn)
  messages: {
    value: (x, y) => {
      if (!x) return y || [];
      if (!y) return x;
      return [...x, ...y];
    },
    default: () => []
  },

  // Conversation context for better understanding
  conversationContext: {
    value: null,
    default: () => ({
      lastApp: null,
      lastAction: null,
      lastParameters: null,
      recentTools: [],
      userPreferences: {},
      conversationSummary: "",
      turnCount: 0
    })
  },
  
  // User ID for personalized tool access
  userId: { value: null },
  
  // Connected accounts for the user
  connectedAccounts: { value: null },
  
  // Processing stage
  currentStage: { value: 'initial' },

  // Thread/Conversation ID for checkpointer
  threadId: { value: null },

  lastStepResult: { value: null }
};
