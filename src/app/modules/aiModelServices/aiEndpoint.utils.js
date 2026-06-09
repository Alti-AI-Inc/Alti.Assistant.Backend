/**
 * @typedef {object} AIEndpoint
 * @property {string} title - The display title or identifier for the AI model.
 * @property {boolean} enabled - Indicates whether the AI model endpoint is currently active and usable.
 * @property {boolean} default - Indicates if this AI model is the default choice when multiple are available.
 * @property {string} add - The API endpoint path for sending new requests to this AI model.
 * @property {string} history - The API endpoint path for retrieving conversation history related to this AI model.
 * @property {string} delete - The API endpoint path for deleting all conversation history related to this AI model.
 */

/**
 * An array of AI endpoint configurations.
 * Each object in the array defines a specific AI model service,
 * including its title, status, default setting, and associated API endpoint paths
 * for various operations like adding new requests, retrieving history, and deleting history.
 *
 * @type {AIEndpoint[]}
 */
const aiEndpoints = [
  {
    title: 'gemini-2.5-flash',
    enabled: true,
    default: true,
    add: '/gemini/get-response',
    history: '/groq/get-response-from-db/',
    delete: '/groq/delete-all-response-from-db/',
  },
  // {
  //   title: 'Llama3-8b-8192',
  //   enabled: false,
  //   default: false,
  //   add: '/groq/get-response',
  //   history: '/groq/get-response-from-db/',
  //   delete: '/groq/delete-all-response-from-db/',
  // },
  // {
  //   title: 'Deepseek-R1-Distill-Qwen-32b',
  //   enabled: true,
  //   default: false,
  //   add: '/deepseek/get-response',
  //   history: '/groq/get-response-from-db/',
  //   delete: '/groq/delete-all-response-from-db/',
  // },
  // {
  //   title: 'Qwen-2.5-coder-32b',
  //   enabled: false,
  //   default: false,
  //   add: '/qwen/coder/get-response',
  //   history: '/groq/get-response-from-db/',
  //   delete: '/groq/delete-all-response-from-db/',
  // },
  // {
  //   title: 'Qween-QWQ-32b',
  //   enabled: true,
  //   default: false,
  //   add: '/qwen/qwq/get-response',
  //   history: '/groq/get-response-from-db/',
  //   delete: '/groq/delete-all-response-from-db/',
  // },
  // {
  //   title: 'Black-Forest-Labs/FLUX.1-Dev-Lora',
  //   enabled: true,
  //   default: false,
  //   history: '/img-generation/create-img',
  //   delete: '/groq/delete-all-response-from-db/',
  // },
];

export default aiEndpoints;