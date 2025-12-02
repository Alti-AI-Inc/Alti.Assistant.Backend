/**
 * Example usage of the Presentation Module
 * 
 * This file demonstrates how to interact with the conversational presentation API
 */

// Example 1: Simple conversation starting from scratch
const example1_SimpleConversation = {
  // First message - User wants to create a presentation
  request1: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'I want to create a presentation about artificial intelligence'
    }
  },
  response1: {
    success: true,
    data: {
      conversationId: 'pres_1234567890_abc',
      needsMoreInfo: true,
      message: 'Great! How many slides would you like in your AI presentation?',
      missingParameters: ['n_slides'],
      collectedParameters: {
        content: 'artificial intelligence'
      }
    }
  },

  // Second message - User provides number of slides
  request2: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: '10 slides please',
      conversationId: 'pres_1234567890_abc'
    }
  },
  response2: {
    success: true,
    data: {
      conversationId: 'pres_1234567890_abc',
      needsMoreInfo: true,
      message: 'Perfect! What style would you prefer? Professional, casual, educational, or something else?',
      missingParameters: ['tone'],
      collectedParameters: {
        content: 'artificial intelligence',
        n_slides: 10
      }
    }
  },

  // Third message - User provides tone
  request3: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'Make it professional',
      conversationId: 'pres_1234567890_abc'
    }
  },
  response3: {
    success: true,
    data: {
      conversationId: 'pres_1234567890_abc',
      success: true,
      message: '🎉 Your presentation is ready!\n\n📊 Presentation ID: d3000f96-096c-4768-b67b-e99aed029b57\n📥 Download: https://api.presenton.ai/static/...\n✏️ Edit online: https://presenton.ai/presentation?id=...\n💳 Credits consumed: 10',
      presentationId: 'd3000f96-096c-4768-b67b-e99aed029b57',
      downloadUrl: 'https://api.presenton.ai/static/user_data/...',
      editUrl: 'https://presenton.ai/presentation?id=d3000f96-096c-4768-b67b-e99aed029b57',
      creditsConsumed: 10
    }
  }
};

// Example 2: Complete request in one message
const example2_CompleteRequest = {
  request: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'Create a professional presentation about Machine Learning with 15 slides using the modern template and professional-blue theme. Use stock images and include a table of contents.'
    }
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
      creditsConsumed: 15
    }
  }
};

// Example 3: Async generation for large presentations
const example3_AsyncGeneration = {
  request: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'Create a detailed 50-slide presentation about Quantum Computing. Make it educational, text-heavy, and generate it asynchronously.'
    }
  },
  response: {
    success: true,
    data: {
      conversationId: 'pres_5555555555_aaa',
      success: true,
      message: '🚀 Presentation generation started!\n\nTask ID: task-9a827c13f4\nStatus: pending\nCreated: 12/2/2025, 10:30:00 AM\n\nYou can check the status anytime by asking me!',
      taskId: 'task-9a827c13f4',
      status: 'pending',
      async: true
    }
  }
};

// Example 4: Check async task status
const example4_CheckStatus = {
  request: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'Check status of task-9a827c13f4',
      conversationId: 'pres_5555555555_aaa'
    }
  },
  response: {
    success: true,
    data: {
      conversationId: 'pres_5555555555_aaa',
      success: true,
      message: '📋 Task Status: COMPLETED\n\n🎉 Your presentation is ready!\n\n📊 Presentation ID: ...\n📥 Download: ...\n✏️ Edit online: ...\n💳 Credits consumed: 50',
      taskId: 'task-9a827c13f4',
      status: 'completed',
      data: {
        presentation_id: 'xyz-123-abc',
        path: 'https://api.presenton.ai/static/...',
        edit_path: 'https://presenton.ai/presentation?id=...',
        credits_consumed: 50
      }
    }
  }
};

// Example 5: Edit existing presentation
const example5_EditPresentation = {
  request: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'Edit presentation d3000f96-096c-4768-b67b-e99aed029b57, change slide 3 title to "New Title" and slide 5 company name to "TechCorp"',
      conversationId: 'pres_1234567890_abc'
    }
  },
  response: {
    success: true,
    data: {
      conversationId: 'pres_1234567890_abc',
      success: true,
      message: '✅ Presentation updated!\n\n📊 New Presentation ID: new-id-here\n📥 Download: ...\n✏️ Edit online: ...',
      presentationId: 'new-id-here',
      downloadUrl: 'https://api.presenton.ai/static/...',
      editUrl: 'https://presenton.ai/presentation?id=...'
    }
  }
};

// Example 6: Ask general questions
const example6_GeneralQuestion = {
  request: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'What templates are available?'
    }
  },
  response: {
    success: true,
    data: {
      conversationId: 'pres_7777777777_bbb',
      success: true,
      message: 'We have 4 templates available:\n\n1. **general** - Versatile and suitable for most presentations\n2. **modern** - Contemporary design with clean lines\n3. **standard** - Classic professional layout\n4. **swift** - Minimalist and efficient design\n\nYou can also choose from 5 themes to customize the colors and styling. Would you like to create a presentation?',
      isGeneralQuestion: true
    }
  }
};

// Example 7: Direct generation (non-conversational)
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
      async: false
    }
  },
  response: {
    success: true,
    message: 'Presentation generated successfully',
    data: {
      presentation_id: 'abc-def-ghi',
      path: 'https://api.presenton.ai/static/...',
      edit_path: 'https://presenton.ai/presentation?id=abc-def-ghi',
      credits_consumed: 12
    }
  }
};

// Example 8: Edit presentation (direct endpoint)
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
            title: 'Updated Introduction'
          }
        },
        {
          index: 3,
          content: {
            companyName: 'New Company Inc',
            revenue: 5000000
          }
        },
        {
          index: 7,
          content: {
            bullets: [
              'First updated point',
              'Second updated point',
              'Third updated point'
            ]
          }
        }
      ],
      export_as: 'pptx'
    }
  },
  response: {
    success: true,
    message: 'Presentation edited successfully',
    data: {
      presentation_id: 'new-presentation-id',
      path: '/app_data/exports/Updated_Presentation.pptx',
      edit_path: '/presentation?id=new-presentation-id'
    }
  }
};

// Example 9: Get presentation details
const example9_GetDetails = {
  request: {
    method: 'GET',
    url: '/api/presentation/d3000f96-096c-4768-b67b-e99aed029b57'
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
          content: { /* slide content */ }
        },
        // ... more slides
      ],
      metadata: {
        template: 'modern',
        theme: 'professional-blue',
        created_at: '2025-12-02T10:00:00Z'
      }
    }
  }
};

// Example 10: Error handling - Missing API key
const example10_ErrorHandling = {
  request: {
    method: 'POST',
    url: '/api/presentation/assistant',
    body: {
      message: 'Create a presentation'
    }
  },
  response: {
    success: false,
    message: 'I encountered an error while generating your presentation: Unauthorized - Invalid API key',
    data: {
      conversationId: 'pres_xxx',
      error: 'Unauthorized'
    }
  }
};

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
  example10_ErrorHandling
};

/**
 * CURL Examples for Testing
 */

// Test conversational assistant
const curlExample1 = `
curl -X POST http://localhost:3000/api/presentation/assistant \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -d '{
    "message": "Create a professional presentation about AI with 10 slides"
  }'
`;

// Test direct generation
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

// Test check status
const curlExample3 = `
curl -X GET http://localhost:3000/api/presentation/status/task-9a827c13f4 \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
`;

export const curlExamples = {
  curlExample1,
  curlExample2,
  curlExample3
};
