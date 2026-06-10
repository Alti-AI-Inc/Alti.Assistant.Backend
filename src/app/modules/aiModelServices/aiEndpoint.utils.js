/**
 * @typedef {object} AIEndpoint
 * @property {string} title - The display title or identifier for the AI model.
 * @property {boolean} enabled - Indicates whether the AI model endpoint is currently active and usable.
 * @property {boolean} default - Indicates if this AI model is the default choice when multiple are available.
 * @property {string} add - The API endpoint path for sending new requests to this AI model.
 * @property {string} history - The API endpoint path for retrieving conversation history related to this AI model.
 * @property {string} delete - The API endpoint path for deleting all conversation history related to this AI model.
 * @property {string[]} [allowedRoles] - Defines which user roles can access this model. If omitted or empty, accessible to all authenticated users. This is critical for enforcing tenant/workspace boundaries. Example: ['admin', 'manager'].
 * @property {object} [usage] - Configuration for tracking usage and limits. This data is used by the business logic to enforce quotas at user, manager, and workspace levels, and to propagate usage details up the hierarchy.
 * @property {number} [usage.costPerRequest=0] - A fixed cost unit for each request to this model.
 * @property {number} [usage.costPerInputToken=0] - A cost unit per input token.
 * @property {number} [usage.costPerOutputToken=0] - A cost unit per output token.
 */

/**
 * An array of AI endpoint configurations.
 * Each object in the array defines a specific AI model service,
 * including its title, status, default setting, and associated API endpoint paths
 * for various operations like adding new requests, retrieving history, and deleting history.
 * It also includes role-based access control and usage cost information to support
 * multi-tenancy, hierarchical permissions, and usage limit enforcement.
 *
 * @type {AIEndpoint[]}
 */
const aiEndpoints = [
  {
    title: 'gemini-2.5-flash',
    enabled: true,
    default: true,
    add: '/gemini/get-response',
    // BUGFIX: Endpoints were incorrectly pointing to Groq. Corrected to point to Gemini-specific paths for consistency.
    history: '/gemini/get-response-from-db/',
    delete: '/gemini/delete-all-response-from-db/',
    // INTEGRATION: Added role-based access control and usage cost configuration.
    // This allows the application to enforce tenant/workspace boundaries and usage limits.
    // This model is available to all roles within an authorized workspace.
    allowedRoles: ['super_admin', 'admin', 'manager', 'user'],
    usage: {
      costPerRequest: 1, // Example cost: 1 credit per request
      costPerInputToken: 0.0001, // Example cost per 1k tokens would be 0.1 credits
      costPerOutputToken: 0.0003, // Example cost per 1k tokens would be 0.3 credits
    },
  },
  // {
  //   title: 'Llama3-8b-8192',
  //   enabled: false,
  //   default: false,
  //   add: '/groq/get-response',
  //   history: '/groq/get-response-from-db/',
  //   delete: '/groq/delete-all-response-from-db/',
  //   // INTEGRATION: Added role-based access control and usage cost configuration.
  //   // This model, when enabled, would be restricted to admins and managers,
  //   // allowing for tiered access within a workspace.
  //   allowedRoles: ['super_admin', 'admin', 'manager'],
  //   usage: {
  //     costPerRequest: 2,
  //     costPerInputToken: 0.0002,
  //     costPerOutputToken: 0.0002,
  //   },
  // },
  // {
  //   title: 'Deepseek-R1-Distill-Qwen-32b',
  //   enabled: true,
  //   default: false,
  //   add: '/deepseek/get-response',
  //   history: '/deepseek/get-response-from-db/', // BUGFIX: Corrected endpoint to be model-specific.
  //   delete: '/deepseek/delete-all-response-from-db/', // BUGFIX: Corrected endpoint to be model-specific.
  //   // INTEGRATION: Added role-based access control and usage cost configuration.
  //   allowedRoles: ['super_admin', 'admin'],
  //   usage: {
  //     costPerRequest: 5,
  //     costPerInputToken: 0.0005,
  //     costPerOutputToken: 0.001,
  //   },
  // },
  // {
  //   title: 'Qwen-2.5-coder-32b',
  //   enabled: false,
  //   default: false,
  //   add: '/qwen/coder/get-response',
  //   history: '/qwen/coder/get-response-from-db/', // BUGFIX: Corrected endpoint to be model-specific.
  //   delete: '/qwen/coder/delete-all-response-from-db/', // BUGFIX: Corrected endpoint to be model-specific.
  //   // INTEGRATION: Added role-based access control and usage cost configuration.
  //   allowedRoles: ['super_admin', 'admin', 'manager'],
  //   usage: {
  //     costPerRequest: 3,
  //     costPerInputToken: 0.0004,
  //     costPerOutputToken: 0.0008,
  //   },
  // },
  // {
  //   title: 'Black-Forest-Labs/FLUX.1-Dev-Lora',
  //   enabled: true,
  //   default: false,
  //   // BUGFIX: The 'add' property was missing and 'history' was misused for the creation endpoint.
  //   // Corrected the property mapping for clarity and to prevent runtime errors.
  //   // Also fixed inconsistent 'delete' endpoint.
  //   add: '/img-generation/create-img',
  //   history: '/img-generation/get-history', // Assumed endpoint for retrieving generated images
  //   delete: '/img-generation/delete-history', // Assumed endpoint for deleting generated images
  //   // INTEGRATION: Added role-based access control and usage cost configuration.
  //   // This is a more expensive model, restricted to super_admin and admin roles by default.
  //   allowedRoles: ['super_admin', 'admin'],
  //   usage: {
  //     costPerRequest: 50, // Image generation is typically more expensive
  //     costPerInputToken: 0, // Not token-based
  //     costPerOutputToken: 0, // Not token-based
  //   },
  // },
];

export default aiEndpoints;