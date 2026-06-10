import { describe, it, expect } from 'vitest';
import { sanitizeToolForGemini, buildEmbeddingText } from './toolSanitizer';

describe('sanitizeToolForGemini', () => {
  it('should return null if the input tool is null or undefined', () => {
    expect(sanitizeToolForGemini(null)).toBeNull();
    expect(sanitizeToolForGemini(undefined)).toBeNull();
  });

  it('should correctly format the tool with basic properties', () => {
    const tool = {
      name: 'Get Weather',
      slug: 'get_weather_slug',
      description: 'Fetches the current weather for a location.',
      parameters: {},
      input_parameters: {
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g., San Francisco, CA',
          },
        },
      },
    };

    const expected = {
      name: 'get_weather_slug',
      description: 'Fetches the current weather for a location.',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g., San Francisco, CA',
          },
        },
      },
    };

    expect(sanitizeToolForGemini(tool)).toEqual(expected);
  });

  it('should remove unsupported fields from the top-level properties', () => {
    const tool = {
      name: 'Create User',
      slug: 'create_user_slug',
      description: 'Creates a new user.',
      parameters: { some_other_param: 'value' },
      input_parameters: {
        properties: {
          username: {
            type: 'string',
            description: 'The desired username.',
            examples: ['john_doe'],
            nullable: false,
            title: 'Username',
            format: 'email',
            human_parameter_name: 'User Name',
          },
          is_admin: {
            type: 'boolean',
            description: 'Whether the user should be an admin.',
            file_uploadable: false,
            human_parameter_description: 'Set admin privileges',
          },
        },
      },
    };

    const expected = {
      name: 'create_user_slug',
      description: 'Creates a new user.',
      parameters: {
        some_other_param: 'value',
        type: 'object',
        properties: {
          username: {
            type: 'string',
            description: 'The desired username.',
          },
          is_admin: {
            type: 'boolean',
            description: 'Whether the user should be an admin.',
          },
        },
      },
    };

    expect(sanitizeToolForGemini(tool)).toEqual(expected);
  });

  it('should recursively clean nested properties', () => {
    const tool = {
      name: 'Create Order',
      slug: 'create_order_slug',
      description: 'Creates a new order with product details.',
      parameters: {},
      input_parameters: {
        properties: {
          order_details: {
            type: 'object',
            properties: {
              product_id: {
                type: 'string',
                title: 'Product ID', // should be removed
              },
              customer_info: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    examples: ['Jane Doe'], // should be removed
                  },
                },
              },
            },
          },
        },
      },
    };

    const expected = {
      name: 'create_order_slug',
      description: 'Creates a new order with product details.',
      parameters: {
        type: 'object',
        properties: {
          order_details: {
            type: 'object',
            properties: {
              product_id: {
                type: 'string',
              },
              customer_info: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(sanitizeToolForGemini(tool)).toEqual(expected);
  });

  it('should recursively clean properties within array items', () => {
    const tool = {
      name: 'Process Items',
      slug: 'process_items_slug',
      description: 'Processes a list of items.',
      parameters: {},
      input_parameters: {
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  nullable: true, // should be removed
                },
                name: {
                  type: 'string',
                  title: 'Item Name', // should be removed
                },
              },
            },
          },
        },
      },
    };

    const expected = {
      name: 'process_items_slug',
      description: 'Processes a list of items.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                },
                name: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    };

    expect(sanitizeToolForGemini(tool)).toEqual(expected);
  });

  it('should handle tools with missing input_parameters or properties', () => {
    const tool1 = {
      name: 'Simple Action',
      slug: 'simple_action_slug',
      description: 'Performs a simple action with no parameters.',
      parameters: {},
    };

    const expected1 = {
      name: 'simple_action_slug',
      description: 'Performs a simple action with no parameters.',
      parameters: {
        type: 'object',
        properties: undefined,
      },
    };
    expect(sanitizeToolForGemini(tool1)).toEqual(expected1);

    const tool2 = {
      ...tool1,
      input_parameters: {},
    };
    const expected2 = { ...expected1 };
    expect(sanitizeToolForGemini(tool2)).toEqual(expected2);

    const tool3 = {
      ...tool1,
      input_parameters: { properties: null },
    };
    const expected3 = {
      name: 'simple_action_slug',
      description: 'Performs a simple action with no parameters.',
      parameters: {
        type: 'object',
        properties: null,
      },
    };
    expect(sanitizeToolForGemini(tool3)).toEqual(expected3);
  });

  it('should not mutate the original tool object', () => {
    const originalTool = {
      name: 'Original Tool',
      slug: 'original_tool_slug',
      description: 'A tool to test for mutation.',
      parameters: {},
      input_parameters: {
        properties: {
          param1: {
            type: 'string',
            title: 'Parameter 1',
            items: {
              type: 'object',
              properties: {
                nested_param: {
                  type: 'string',
                  nullable: true,
                },
              },
            },
          },
        },
      },
    };

    const originalToolDeepCopy = JSON.parse(JSON.stringify(originalTool));

    sanitizeToolForGemini(originalTool);

    expect(originalTool).toEqual(originalToolDeepCopy);
  });
});

describe('buildEmbeddingText', () => {
  it('should build a complete embedding text from a full document', () => {
    const doc = {
      name: 'Send Email',
      description: 'Sends an email to a recipient.',
      tags: ['communication', 'email', 'gmail'],
      appName: 'Gmail',
      slug: 'gmail_send_email',
    };
    const expected = 'Send Email\nSends an email to a recipient.\nTags: communication, email, gmail\nAppName: Gmail\nSlug: gmail_send_email';
    expect(buildEmbeddingText(doc)).toBe(expected);
  });

  it('should handle null or undefined input gracefully', () => {
    const expected = 'Tags: \nAppName: \nSlug:';
    expect(buildEmbeddingText(null)).toBe(expected);
    expect(buildEmbeddingText(undefined)).toBe(expected);
  });

  it('should handle an empty document object', () => {
    const doc = {};
    const expected = 'Tags: \nAppName: \nSlug:';
    expect(buildEmbeddingText(doc)).toBe(expected);
  });

  it('should handle documents with missing or null properties', () => {
    const doc = {
      name: 'Create Task',
      description: 'Creates a new task in the system.',
      tags: null, // should be handled
      appName: undefined, // should be handled
      slug: 'jira_create_task',
    };
    const expected = 'Create Task\nCreates a new task in the system.\nTags: \nAppName: \nSlug: jira_create_task';
    expect(buildEmbeddingText(doc)).toBe(expected);
  });

  it('should handle tags that are an empty array', () => {
    const doc = {
      name: 'Get User',
      description: 'Retrieves user details.',
      tags: [],
      appName: 'Internal API',
      slug: 'internal_get_user',
    };
    const expected = 'Get User\nRetrieves user details.\nTags: \nAppName: Internal API\nSlug: internal_get_user';
    expect(buildEmbeddingText(doc)).toBe(expected);
  });

  it('should handle tags that are not an array', () => {
    const doc = {
      name: 'Log Event',
      description: 'Logs an event.',
      tags: 'logging', // not an array
      appName: 'System',
      slug: 'system_log_event',
    };
    const expected = 'Log Event\nLogs an event.\nTags: \nAppName: System\nSlug: system_log_event';
    expect(buildEmbeddingText(doc)).toBe(expected);
  });
});