const aiEndpoints = [
  {
    title: 'gemini-3-pro-preview',
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
