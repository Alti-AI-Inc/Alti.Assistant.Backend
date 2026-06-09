/**
 * @typedef {object} WorkflowAutomationState
 * @property {Array<any>} messages - A list of messages, typically representing the conversation history.
 * @property {string} userPrompt - The current prompt provided by the user.
 * @property {string} userId - The ID of the user initiating the workflow.
 * @property {string} conversationId - The ID of the current conversation.
 *
 * @property {string} userIntent - The detected intent of the user's prompt (e.g., "create workflow", "get status").
 * @property {string} taskType - The type of task identified from the user's intent.
 * @property {string} complexity - The estimated complexity of the task.
 *
 * @property {Array<string>} detectedApps - A list of applications detected as relevant to the user's request.
 * @property {Array<string>} requiredActions - A list of actions required to fulfill the user's request.
 *
 * @property {object} workflowPlan - The detailed plan for the workflow, including steps and logic.
 * @property {Array<object>} workflowSteps - An ordered list of individual steps within the workflow plan.
 *
 * @property {boolean} scheduleRequired - Indicates if the workflow requires scheduling.
 * @property {object} scheduleConfig - Configuration details for scheduling the workflow (e.g., frequency, time).
 * @property {string} triggerType - The type of trigger for the workflow (e.g., 'manual', 'scheduled', 'event').
 *
 * @property {object} extractedParameters - Key-value pairs of parameters extracted from the user's prompt.
 * @property {Array<string>} missingParameters - A list of parameters that are required but could not be extracted.
 *
 * @property {object} validationResult - The result of validating the extracted parameters and workflow plan.
 * @property {boolean} needsConfirmation - Indicates if the workflow plan requires user confirmation before execution.
 * @property {string} confirmationMessage - The message to display to the user for confirmation.
 *
 * @property {object|null} createdWorkflow - The object representing the newly created workflow.
 * @property {string} workflowId - The ID of the created workflow.
 *
 * @property {object} executionContext - Contextual information relevant to the current execution of the workflow.
 * @property {number} currentStep - The index of the current step being executed in the workflow.
 * @property {Array<object>} stepResults - A list of results from each executed step.
 *
 * @property {string} error - A general error message if an error occurred.
 * @property {Array<string>} errors - A list of specific error messages encountered during processing.
 *
 * @property {string} response - The final response message to be sent back to the user.
 * @property {string} responseType - The type of response (e.g., 'info', 'success', 'error', 'question').
 * @property {Array<string>} suggestions - A list of suggested next actions or prompts for the user.
 *
 * @property {Array<object>} chatHistory - The complete history of the conversation.
 *
 * @property {string} workflowStatus - The current status of the workflow (e.g., 'draft', 'pending', 'active', 'completed', 'failed').
 * @property {string} nextAction - The next action the system plans to take or expects from the user.
 *
 * @property {object|null} executionResult - The final result of the workflow execution.
 * @property {boolean} allAppsConnected - Indicates if all required applications are connected.
 * @property {string} savedWorkflowId - The ID of the workflow once it has been saved.
 *
 * @property {object} connectionUrls - A map of application names to their connection URLs.
 * @property {Array<string>} missingConnections - A list of applications that are required but not connected.
 * @property {Array<string>} availableApps - A list of applications that are available for use.
 * @property {Array<string>} invalidApps - A list of applications that are detected but invalid or misconfigured.
 * @property {object|null} connectionStatus - The overall status of application connections.
 * @property {object} availableTools - A map of available tools (functions/actions) by application.
 *
 * @property {object} debugInfo - Miscellaneous debug information.
 * @property {string} currentStage - The current stage of the workflow automation process (e.g., 'init', 'intent_detection', 'planning', 'execution').
 */
/**
 * Defines the state structure for the workflow automation process,
 * designed for use with LangGraph's state management. Each property
 * specifies how its value is managed, typically with a `reducer` function
 * for updates and a `default` value for initialization.
 *
 * @type {WorkflowAutomationState}
 */
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