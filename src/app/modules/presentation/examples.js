/**
 * Example usage of the Presentation Module
 *
 * This file demonstrates how to interact with the conversational presentation API
 */

/**
 * @typedef {object} PresentationAssistantRequest
 * @property {string} method - The HTTP method (e.g., 'POST').
 * @property {string} url - The API endpoint URL.
 * @property {object} body - The request body.
 * @property {string} body.message - The user's message to the assistant.
 * @property {string} [body.conversationId] - The ID of an ongoing conversation, if applicable.
 */

/**
 * @typedef {object} PresentationAssistantResponseData
 * @property {string} conversationId - The ID of the current conversation.
 * @property {boolean} [needsMoreInfo] - Indicates if the assistant requires more information.
 * @property {string} message - The assistant's response message.
 * @property {string[]} [missingParameters] - An array of parameters still needed by the assistant.
 * @property {object} [collectedParameters] - Parameters collected so far in the conversation.
 * @property {string} [collectedParameters.content] - The main content/topic of the presentation.
 * @property {number} [collectedParameters.n_slides] - The number of slides requested.
 * @property {string} [collectedParameters.tone] - The desired tone of the presentation.
 * @property {string} [presentationId] - The ID of the generated presentation.
 * @property {string} [downloadUrl] - URL to download the generated presentation.
 * @property {string} [editUrl] - URL to edit the presentation online.
 * @property {number} [creditsConsumed] - Number of credits consumed for the operation.
 * @property {string} [taskId] - ID of an asynchronous task.
 * @property {string} [status] - Status of an asynchronous task (e.g., 'pending', 'completed').
 * @property {boolean} [async] - Indicates if the operation is asynchronous.
 * @property {boolean} [isGeneralQuestion] - Indicates if the response is to a general question.
 * @property {object} [data] - Nested data object for task status or error details.
 * @property {string} [data.presentation_id] - Presentation ID within nested data.
 * @property {string} [data.path] - Download path within nested data.
 * @property {string} [data.edit_path] - Edit path within nested data.
 * @property {number} [data.credits_consumed] - Credits consumed within nested data.
 * @property {string} [error] - Error message in case of failure.
 */

/**
 * @typedef {object} PresentationAssistantResponse
 * @property {boolean} success - Indicates if the API call was successful.
 * @property {string} [message] - A general message from the API.
 * @property {PresentationAssistantResponseData} data - The response data from the assistant.
 */

/**
 * @typedef {object} PresentationExample
 * @property {PresentationAssistantRequest} request - The example API request.
 * @property {PresentationAssistantResponse} response - The expected API response.
 */

/**
 * Example 1: Simple conversation starting from scratch.
 * This demonstrates a multi-turn interaction with the presentation assistant
 * to gather all necessary parameters for presentation generation.
 * @type {object}
 * @property {object} request1 - First message: User wants to create a presentation.
 * @property {string} request1.method - HTTP method.
 * @property {string} request1.url - API endpoint.
 * @property {object} request1.body - Request body.
 * @property {string} request1.body.message - User's initial message.
 * @property {object} response1 - Assistant's response, asking for number of slides.
 * @property {boolean} response1.success - True if successful.
 * @property {PresentationAssistantResponseData} response1.data - Response data.
 * @property {object} request2 - Second message: User provides number of slides.
 * @property {string} request2.method - HTTP method.
 * @property {string} request2.url - API endpoint.
 * @property {object} request2.body - Request body.
 * @property {string} request2.body.message - User's message providing slide count.
 * @property {string} request2.body.conversationId - Conversation ID from previous response.
 * @property {object} response2 - Assistant's response, asking for style/tone.
 * @property {boolean} response2.success - True if successful.
 * @property {PresentationAssistantResponseData} response2.data - Response data.
 * @property {object} request3 - Third message: User provides tone.
 * @property {string} request3.method - HTTP method.
 * @property {string} request3.url - API endpoint.
 * @property {object} request3.body - Request body.
 * @property {string} request3.body.message - User's message providing tone.
 * @property {string} request3.body.conversationId - Conversation ID from previous response.
 * @property {object} response3 - Assistant's final response, indicating presentation is ready.
 * @property {boolean} response3.success - True if successful.
 * @property {PresentationAssistantResponseData} response3.data - Response data.
 */
const example1_SimpleConversation = {
  // First message - User wants to create a presentation
  request1: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'I want to create a presentation about artificial intelligence',
    },
  },
  response1: {
    success: true,
    data: {
      conversationId: 'pres_1234567890_abc',
      needsMoreInfo: true,
      message: 'Great! How many slides would you like in your AI presentation?',
      missingParameters: ['n_slides'],
      collectedParameters: {
        content: 'artificial intelligence',
      },
    },
  },

  // Second message - User provides number of slides
  request2: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: '10 slides please',
      conversationId: 'pres_1234567890_abc',
    },
  },
  response2: {
    success: true,
    data: {
      conversationId: 'pres_1234567890_abc',
      needsMoreInfo: true,
      message:
        'Perfect! What style would you prefer? Professional, casual, educational, or something else?',
      missingParameters: ['tone'],
      collectedParameters: {
        content: 'artificial intelligence',
        n_slides: 10,
      },
    },
  },

  // Third message - User provides tone
  request3: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'Make it professional',
      conversationId: 'pres_1234567890_abc',
    },
  },
  response3: {
    success: true,
    data: {
      conversationId: 'pres_1234567890_abc',
      success: true,
      message:
        '🎉 Your presentation is ready!\n\n📊 Presentation ID: d3000f96-096c-4768-b67b-e99aed029b57\n📥 Download: https://api.presenton.ai/static/...\n✏️ Edit online: https://presenton.ai/presentation?id=...\n💳 Credits consumed: 10',
      presentationId: 'd3000f96-096c-4768-b67b-e99aed029b57',
      downloadUrl: 'https://api.presenton.ai/static/user_data/...',
      editUrl:
        'https://presenton.ai/presentation?id=d3000f96-096c-4768-b67b-e99aed029b57',
      creditsConsumed: 10,
    },
  },
};

/**
 * Example 2: Complete request in one message.
 * Demonstrates providing all necessary presentation parameters in a single conversational message.
 * @type {PresentationExample}
 * @property {PresentationAssistantRequest} request - The API request.
 * @property {PresentationAssistantResponse} response - The expected API response.
 */
const example2_CompleteRequest = {
  request: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message:
        'Create a professional presentation about Machine Learning with 15 slides using the modern template and professional-blue theme. Use stock images and include a table of contents.',
    },
  },
  response: {
    success: true,
    data: {
      conversationId: 'pres_9876543210_xyz',
      success: true,
      message: '🎉 Your presentation is ready!...',
      presentationId: 'a1b2c3d4-5678-90ab-cdef-123456789012',
      downloadUrl: 'https://api.presenton.ai/static/...',
      editUrl: 'https://presenton.ai/presentation?id=...',
      creditsConsumed: 15,
    },
  },
};

/**
 * Example 3: Asynchronous generation for large presentations.
 * Demonstrates initiating a presentation generation task that might take longer,
 * returning a task ID for later status checks.
 * @type {PresentationExample}
 * @property {PresentationAssistantRequest} request - The API request.
 * @property {PresentationAssistantResponse} response - The expected API response.
 */
const example3_AsyncGeneration = {
  request: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message:
        'Create a detailed 50-slide presentation about Quantum Computing. Make it educational, text-heavy, and generate it asynchronously.',
    },
  },
  response: {
    success: true,
    data: {
      conversationId: 'pres_5555555555_aaa',
      success: true,
      message:
        '🚀 Presentation generation started!\n\nTask ID: task-9a827c13f4\nStatus: pending\nCreated: 12/2/2025, 10:30:00 AM\n\nYou can check the status anytime by asking me!',
      taskId: 'task-9a827c13f4',
      status: 'pending',
      async: true,
    },
  },
};

/**
 * Example 4: Check asynchronous task status.
 * Demonstrates how to query the status of a previously initiated asynchronous presentation generation task.
 * @type {PresentationExample}
 * @property {PresentationAssistantRequest} request - The API request.
 * @property {PresentationAssistantResponse} response - The expected API response.
 */
const example4_CheckStatus = {
  request: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'Check status of task-9a827c13f4',
      conversationId: 'pres_5555555555_aaa',
    },
  },
  response: {
    success: true,
    data: {
      conversationId: 'pres_5555555555_aaa',
      success: true,
      message:
        '📋 Task Status: COMPLETED\n\n🎉 Your presentation is ready!\n\n📊 Presentation ID: ...\n📥 Download: ...\n✏️ Edit online: ...\n💳 Credits consumed: 50',
      taskId: 'task-9a827c13f4',
      status: 'completed',
      data: {
        presentation_id: 'xyz-123-abc',
        path: 'https://api.presenton.ai/static/...',
        edit_path: 'https://presenton.ai/presentation?id=...',
        credits_consumed: 50,
      },
    },
  },
};

/**
 * Example 5: Edit existing presentation via conversational interface.
 * Demonstrates how to request modifications to an already generated presentation using natural language.
 * @type {PresentationExample}
 * @property {PresentationAssistantRequest} request - The API request.
 * @property {PresentationAssistantResponse} response - The expected API response.
 */
const example5_EditPresentation = {
  request: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message:
        'Edit presentation d3000f96-096c-4768-b67b-e99aed029b57, change slide 3 title to "New Title" and slide 5 company name to "TechCorp"',
      conversationId: 'pres_1234567890_abc',
    },
  },
  response: {
    success: true,
    data: {
      conversationId: 'pres_1234567890_abc',
      success: true,
      message:
        '✅ Presentation updated!\n\n📊 New Presentation ID: new-id-here\n📥 Download: ...\n✏️ Edit online: ...',
      presentationId: 'new-id-here',
      downloadUrl: 'https://api.presenton.ai/static/...',
      editUrl: 'https://presenton.ai/presentation?id=...',
    },
  },
};

/**
 * Example 6: Ask general questions to the assistant.
 * Demonstrates querying the assistant for information not directly related to presentation generation,
 * such as available templates or features.
 * @type {PresentationExample}
 * @property {PresentationAssistantRequest} request - The API request.
 * @property {PresentationAssistantResponse} response - The expected API response.
 */
const example6_GeneralQuestion = {
  request: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'What templates are available?',
    },
  },
  response: {
    success: true,
    data: {
      conversationId: 'pres_7777777777_bbb',
      success: true,
      message:
        'We have 4 templates available:\n\n1. **general** - Versatile and suitable for most presentations\n2. **modern** - Contemporary design with clean lines\n3. **standard** - Classic professional layout\n4. **swift** - Minimalist and efficient design\n\nYou can also choose from 5 themes to customize the colors and styling. Would you like to create a presentation?',
      isGeneralQuestion: true,
    },
  },
};

/**
 * @typedef {object} DirectGenerationRequestBody
 * @property {string} content - The main topic or content of the presentation.
 * @property {number} n_slides - The desired number of slides.
 * @property {string} [language='English'] - The language of the presentation.
 * @property {string} [template='general'] - The template to use (e.g., 'modern', 'standard').
 * @property {string} [theme='default'] - The visual theme/color scheme.
 * @property {string} [export_as='pptx'] - The desired export format (e.g., 'pptx', 'pdf').
 * @property {string} [tone='professional'] - The tone of the presentation (e.g., 'educational', 'casual').
 * @property {string} [verbosity='standard'] - The level of detail in the slides.
 * @property {string} [image_type='stock'] - Type of images to include (e.g., 'stock', 'none').
 * @property {boolean} [web_search=false] - Whether to perform a web search for content.
 * @property {boolean} [include_table_of_contents=false] - Whether to include a table of contents slide.
 * @property {boolean} [include_title_slide=true] - Whether to include a title slide.
 * @property {boolean} [async=false] - Whether to generate the presentation asynchronously.
 */

/**
 * @typedef {object} DirectGenerationResponseData
 * @property {string} presentation_id - The ID of the generated presentation.
 * @property {string} path - The download path for the presentation.
 * @property {string} edit_path - The URL to edit the presentation online.
 * @property {number} credits_consumed - The number of credits consumed.
 */

/**
 * @typedef {object} DirectGenerationResponse
 * @property {boolean} success - Indicates if the API call was successful.
 * @property {string} message - A message indicating the outcome.
 * @property {DirectGenerationResponseData} data - The response data.
 */

/**
 * @typedef {object} DirectGenerationExample
 * @property {object} request - The API request.
 * @property {string} request.method - HTTP method.
 * @property {string} request.url - API endpoint.
 * @property {DirectGenerationRequestBody} request.body - Request body with direct generation parameters.
 * @property {DirectGenerationResponse} response - The expected API response.
 */

/**
 * Example 7: Direct generation (non-conversational).
 * Demonstrates generating a presentation by providing all parameters directly in a single API call,
 * bypassing the conversational assistant.
 * @type {DirectGenerationExample}
 */
const example7_DirectGeneration = {
  request: {
    method: 'POST',
    url: '/api/presentation/generate',
    body: {
      content: 'Introduction to Python Programming',
      n_slides: 12,
      language: 'English',
      template: 'modern',
      theme: 'professional-blue',
      export_as: 'pptx',
      tone: 'educational',
      verbosity: 'standard',
      image_type: 'stock',
      web_search: false,
      include_table_of_contents: true,
      include_title_slide: true,
      async: false,
    },
  },
  response: {
    success: true,
    message: 'Presentation generated successfully',
    data: {
      presentation_id: 'abc-def-ghi',
      path: 'https://api.presenton.ai/static/...',
      edit_path: 'https://presenton.ai/presentation?id=abc-def-ghi',
      credits_consumed: 12,
    },
  },
};

/**
 * @typedef {object} DirectEditSlideContent
 * @property {string} [title] - New title for the slide.
 * @property {string} [companyName] - New company name for the slide.
 * @property {number} [revenue] - New revenue figure for the slide.
 * @property {string[]} [bullets] - New bullet points for the slide.
 * // ... other possible content fields
 */

/**
 * @typedef {object} DirectEditSlide
 * @property {number} index - The 0-based index of the slide to edit.
 * @property {DirectEditSlideContent} content - The content fields to update on the slide.
 */

/**
 * @typedef {object} DirectEditRequestBody
 * @property {string} presentationId - The ID of the presentation to edit.
 * @property {DirectEditSlide[]} slides - An array of slide objects specifying changes.
 * @property {string} [export_as='pptx'] - The desired export format for the updated presentation.
 */

/**
 * @typedef {object} DirectEditResponseData
 * @property {string} presentation_id - The ID of the newly generated (edited) presentation.
 * @property {string} path - The download path for the edited presentation.
 * @property {string} edit_path - The URL to edit the presentation online.
 */

/**
 * @typedef {object} DirectEditResponse
 * @property {boolean} success - Indicates if the API call was successful.
 * @property {string} message - A message indicating the outcome.
 * @property {DirectEditResponseData} data - The response data.
 */

/**
 * @typedef {object} DirectEditExample
 * @property {object} request - The API request.
 * @property {string} request.method - HTTP method.
 * @property {string} request.url - API endpoint.
 * @property {DirectEditRequestBody} request.body - Request body with direct edit parameters.
 * @property {DirectEditResponse} response - The expected API response.
 */

/**
 * Example 8: Edit presentation (direct endpoint).
 * Demonstrates editing an existing presentation by directly specifying slide indices and content changes.
 * @type {DirectEditExample}
 */
const example8_DirectEdit = {
  request: {
    method: 'POST',
    url: '/api/presentation/edit',
    body: {
      presentationId: 'd3000f96-096c-4768-b67b-e99aed029b57',
      slides: [
        {
          index: 0,
          content: {
            title: 'Updated Introduction',
          },
        },
        {
          index: 3,
          content: {
            companyName: 'New Company Inc',
            revenue: 5000000,
          },
        },
        {
          index: 7,
          content: {
            bullets: [
              'First updated point',
              'Second updated point',
              'Third updated point',
            ],
          },
        },
      ],
      export_as: 'pptx',
    },
  },
  response: {
    success: true,
    message: 'Presentation edited successfully',
    data: {
      presentation_id: 'new-presentation-id',
      path: '/app_data/exports/Updated_Presentation.pptx',
      edit_path: '/presentation?id=new-presentation-id',
    },
  },
};

/**
 * @typedef {object} GetDetailsSlideContent
 * @property {string} [title] - The title of the slide.
 * // ... other possible content fields depending on slide type
 */

/**
 * @typedef {object} GetDetailsSlide
 * @property {number} index - The 0-based index of the slide.
 * @property {string} type - The type of the slide (e.g., 'title', 'content', 'bullet').
 * @property {GetDetailsSlideContent} content - The content of the slide.
 */

/**
 * @typedef {object} GetDetailsMetadata
 * @property {string} template - The template used for the presentation.
 * @property {string} theme - The theme used for the presentation.
 * @property {string} created_at - ISO 8601 timestamp of creation.
 */

/**
 * @typedef {object} GetDetailsResponseData
 * @property {string} id - The ID of the presentation.
 * @property {string} title - The title of the presentation.
 * @property {GetDetailsSlide[]} slides - An array of slide objects with their content.
 * @property {GetDetailsMetadata} metadata - Metadata about the presentation.
 */

/**
 * @typedef {object} GetDetailsResponse
 * @property {boolean} success - Indicates if the API call was successful.
 * @property {string} message - A message indicating the outcome.
 * @property {GetDetailsResponseData} data - The response data.
 */

/**
 * @typedef {object} GetDetailsExample
 * @property {object} request - The API request.
 * @property {string} request.method - HTTP method.
 * @property {string} request.url - API endpoint including presentation ID.
 * @property {GetDetailsResponse} response - The expected API response.
 */

/**
 * Example 9: Get presentation details.
 * Demonstrates retrieving detailed information about a specific presentation, including its slides and metadata.
 * @type {GetDetailsExample}
 */
const example9_GetDetails = {
  request: {
    method: 'GET',
    url: '/api/presentation/d3000f96-096c-4768-b67b-e99aed029b57',
  },
  response: {
    success: true,
    message: 'Presentation retrieved successfully',
    data: {
      id: 'd3000f96-096c-4768-b67b-e99aed029b57',
      title: 'Introduction to Machine Learning',
      slides: [
        {
          index: 0,
          type: 'title',
          content: {
            /* slide content */
          },
        },
        // ... more slides
      ],
      metadata: {
        template: 'modern',
        theme: 'professional-blue',
        created_at: '2025-12-02T10:00:00Z',
      },
    },
  },
};

/**
 * @typedef {object} ErrorHandlingResponseData
 * @property {string} conversationId - The conversation ID, if available.
 * @property {string} error - The type of error encountered.
 */

/**
 * @typedef {object} ErrorHandlingResponse
 * @property {boolean} success - Indicates if the API call was successful (false in this case).
 * @property {string} message - A detailed error message.
 * @property {ErrorHandlingResponseData} data - Error-specific data.
 */

/**
 * @typedef {object} ErrorHandlingExample
 * @property {object} request - The API request.
 * @property {string} request.method - HTTP method.
 * @property {string} request.url - API endpoint.
 * @property {object} request.body - Request body.
 * @property {string} request.body.message - User's message.
 * @property {ErrorHandlingResponse} response - The expected API error response.
 */

/**
 * Example 10: Error handling - Missing API key.
 * Demonstrates an example of an API response when an authorization error occurs,
 * such as a missing or invalid API key.
 * @type {ErrorHandlingExample}
 */
const example10_ErrorHandling = {
  request: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'Create a presentation',
    },
  },
  response: {
    success: false,
    message:
      'I encountered an error while generating your presentation: Unauthorized - Invalid API key',
    data: {
      conversationId: 'pres_xxx',
      error: 'Unauthorized',
    },
  },
};

/**
 * An object containing various example API interactions with the Presentation Module.
 * Each property represents a distinct use case or flow.
 * @type {object}
 * @property {object} example1_SimpleConversation - Multi-turn conversational flow.
 * @property {object} example2_CompleteRequest - Single-message complete conversational request.
 * @property {object} example3_AsyncGeneration - Initiating an asynchronous presentation generation.
 * @property {object} example4_CheckStatus - Checking the status of an asynchronous task.
 * @property {object} example5_EditPresentation - Editing an existing presentation via conversation.
 * @property {object} example6_GeneralQuestion - Asking general questions to the assistant.
 * @property {object} example7_DirectGeneration - Direct, non-conversational presentation generation.
 * @property {object} example8_DirectEdit - Direct, non-conversational presentation editing.
 * @property {object} example9_GetDetails - Retrieving details of an existing presentation.
 * @property {object} example10_ErrorHandling - Example of an API error response.
 */
export const examples = {
  example1_SimpleConversation,
  example2_CompleteRequest,
  example3_AsyncGeneration,
  example4_CheckStatus,
  example5_EditPresentation,
  example6_GeneralQuestion,
  example7_DirectGeneration,
  example8_DirectEdit,
  example9_GetDetails,
  example10_ErrorHandling,
};

/**
 * CURL Examples for Testing
 */

/**
 * CURL command example for testing the conversational presentation assistant endpoint.
 * This command initiates a presentation creation request with a natural language message.
 * Replace `YOUR_JWT_TOKEN` with a valid authentication token.
 * @type {string}
 */
const curlExample1 = `
curl -X POST http://localhost:3000/api/presentation/assistant \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -d '{
    "message": "Create a professional presentation about AI with 10 slides"
  }'
`;

/**
 * CURL command example for testing the direct presentation generation endpoint.
 * This command generates a presentation by providing all parameters explicitly in the request body.
 * Replace `YOUR_JWT_TOKEN` with a valid authentication token.
 * @type {string}
 */
const curlExample2 = `
curl -X POST http://localhost:3000/api/presentation/generate \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -d '{
    "content": "Machine Learning Basics",
    "n_slides": 8,
    "template": "modern",
    "tone": "educational",
    "export_as": "pptx"
  }'
`;

/**
 * CURL command example for checking the status of an asynchronous presentation task.
 * This command queries the status endpoint using a specific task ID.
 * Replace `YOUR_JWT_TOKEN` with a valid authentication token.
 * @type {string}
 */
const curlExample3 = `
curl -X GET http://localhost:3000/api/presentation/status/task-9a827c13f4 \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
`;

/**
 * An object containing various CURL command examples for direct testing of the Presentation Module APIs.
 * @type {object}
 * @property {string} curlExample1 - CURL command for conversational assistant.
 * @property {string} curlExample2 - CURL command for direct presentation generation.
 * @property {string} curlExample3 - CURL command for checking asynchronous task status.
 */
export const curlExamples = {
  curlExample1,
  curlExample2,
  curlExample3,
};