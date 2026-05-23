// Define the state structure for workflow automation
export const workflowAutomationState = {
  // Input from user
  messages: { value: null },
  userPrompt: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },
  userId: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },
  conversationId: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },

  // Intent analysis
  userIntent: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },
  taskType: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },
  complexity: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },

  // App and action detection
  detectedApps: {
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  },
  requiredActions: {
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  },

  // Workflow planning
  workflowPlan: {
    reducer: (x, y) => y ?? x,
    default: () => ({}),
  },
  workflowSteps: {
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  },

  // Schedule detection
  scheduleRequired: {
    reducer: (x, y) => y ?? x,
    default: () => false,
  },
  scheduleConfig: {
    reducer: (x, y) => y ?? x,
    default: () => ({}),
  },
  triggerType: {
    reducer: (x, y) => y ?? x,
    default: () => 'manual',
  },

  // Parameter extraction
  extractedParameters: {
    reducer: (x, y) => y ?? x,
    default: () => ({}),
  },
  missingParameters: {
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  },

  // Validation and confirmation
  validationResult: {
    reducer: (x, y) => y ?? x,
    default: () => ({}),
  },
  needsConfirmation: {
    reducer: (x, y) => y ?? x,
    default: () => false,
  },
  confirmationMessage: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },

  // Workflow creation
  createdWorkflow: {
    reducer: (x, y) => y ?? x,
    default: () => null,
  },
  workflowId: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },

  // Execution context
  executionContext: {
    reducer: (x, y) => y ?? x,
    default: () => ({}),
  },
  currentStep: {
    reducer: (x, y) => y ?? x,
    default: () => 0,
  },
  stepResults: {
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  },

  // Error handling
  error: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },
  errors: {
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  },

  // Response generation
  response: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },
  responseType: {
    reducer: (x, y) => y ?? x,
    default: () => 'info',
  },
  suggestions: {
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  },

  // Chat context
  chatHistory: {
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  },

  // Workflow management
  workflowStatus: {
    reducer: (x, y) => y ?? x,
    default: () => 'draft',
  },
  nextAction: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },

  // Workflow execution results (Phase 2: Execution Agent)
  executionResult: {
    reducer: (x, y) => y ?? x,
    default: () => null,
  },
  allAppsConnected: {
    reducer: (x, y) => y ?? x,
    default: () => false,
  },
  savedWorkflowId: {
    reducer: (x, y) => y ?? x,
    default: () => '',
  },

  // Connection health
  connectionUrls: {
    reducer: (x, y) => y ?? x,
    default: () => ({}),
  },
  missingConnections: {
    reducer: (x, y) => y ?? x,
    default: () => [],
  },
  availableApps: {
    reducer: (x, y) => y ?? x,
    default: () => [],
  },
  invalidApps: {
    reducer: (x, y) => y ?? x,
    default: () => [],
  },
  connectionStatus: {
    reducer: (x, y) => y ?? x,
    default: () => null,
  },
  availableTools: {
    reducer: (x, y) => y ?? x,
    default: () => ({}),
  },

  // Debug and logging
  debugInfo: {
    reducer: (x, y) => y ?? x,
    default: () => ({}),
  },
  currentStage: {
    reducer: (x, y) => y ?? x,
    default: () => 'init',
  },
};
