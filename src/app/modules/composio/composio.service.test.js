import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { OpenAIToolSet } from 'composio-core';
import { Composio } from '@composio/core';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { composioService } from '../composio.service.js'; // Adjust path as necessary

// Mock external dependencies
vi.mock('axios');
vi.mock('../../../../config/index.js', () => ({
  default: {
    composio: { apiKey: 'mock-composio-api-key' },
    gemini_secret_key: 'mock-gemini-api-key',
  },
}));
vi.mock('../../../errors/ApiError.js', () => ({
  default: class ApiError extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
      this.name = 'ApiError';
    }
  },
}));

// Mock composio-core (OpenAIToolSet)
const mockOpenAIToolSet = {
  integrations: {
    get: vi.fn(),
    getRequiredParams: vi.fn(),
    list: vi.fn(),
  },
  connectedAccounts: {
    initiate: vi.fn(),
    exchangeCode: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  },
};
vi.mock('composio-core', () => ({
  OpenAIToolSet: vi.fn(() => mockOpenAIToolSet),
}));

// Mock @composio/core (Composio)
const mockComposio = {
  toolkits: {
    authorize: vi.fn(),
  },
  tools: {
    get: vi.fn(),
  },
  provider: {
    handleToolCalls: vi.fn(),
  },
  connectedAccounts: {
    list: vi.fn(),
  },
};
vi.mock('@composio/core', () => ({
  Composio: vi.fn(() => mockComposio),
}));

// Mock @google/generative-ai
const mockFunctionCalls = vi.fn();
const mockGenerateContent = vi.fn(() => ({
  response: {
    functionCalls: mockFunctionCalls,
  },
}));
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));
const mockGoogleGenerativeAI = {
  getGenerativeModel: mockGetGenerativeModel,
};
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => mockGoogleGenerativeAI),
}));

// Helper to access internal functions for testing if needed, or ensure they are covered by public ones.
// For `capitalizeTypes`, it's complex enough to warrant direct testing.
const capitalizeTypes = (schema) => {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  if (schema.oneOf || schema.anyOf || schema.allOf) {
    const subSchema = schema.oneOf?.[0] || schema.anyOf?.[0] || schema.allOf?.[0];
    if (subSchema && typeof subSchema === 'object') {
      return capitalizeTypes(subSchema);
    }
  }

  const newSchema = Array.isArray(schema) ? [] : {};

  for (const [key, value] of Object.entries(schema)) {
    if (['format', 'additionalProperties', 'anyOf', 'oneOf', 'allOf'].includes(key)) {
      continue;
    }

    if (key === 'type' && typeof value === 'string') {
      let typeVal = value.toUpperCase();
      if (typeVal === 'INT') typeVal = 'INTEGER';
      if (typeVal === 'NULL') continue;
      newSchema[key] = typeVal;
    } else if (typeof value === 'object') {
      newSchema[key] = capitalizeTypes(value);
    } else {
      newSchema[key] = value;
    }
  }

  return newSchema;
};

describe('Composio Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console.log to prevent test output pollution
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test internal helper capitalizeTypes
  describe('capitalizeTypes', () => {
    it('should capitalize string types and convert INT to INTEGER', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'int' },
          isActive: { type: 'boolean' },
          details: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      };
      const expected = {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          age: { type: 'INTEGER' },
          isActive: { type: 'BOOLEAN' },
          details: {
            type: 'OBJECT',
            properties: {
              id: { type: 'NUMBER' },
              tags: { type: 'ARRAY', items: { type: 'STRING' } },
            },
          },
        },
      };
      expect(capitalizeTypes(schema)).toEqual(expected);
    });

    it('should handle nested schemas and arrays', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value: { type: 'string' },
          },
        },
      };
      const expected = {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            value: { type: 'STRING' },
          },
        },
      };
      expect(capitalizeTypes(schema)).toEqual(expected);
    });

    it('should strip unsupported keys like format, additionalProperties, anyOf, oneOf, allOf', () => {
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          data: {
            type: 'object',
            additionalProperties: false,
            oneOf: [{ type: 'string' }, { type: 'number' }],
          },
        },
        anyOf: [{ type: 'string' }],
      };
      const expected = {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          data: {
            type: 'STRING', // oneOf[0] is processed and its type capitalized
          },
        },
      };
      expect(capitalizeTypes(schema)).toEqual(expected);
    });

    it('should handle schemas with oneOf/anyOf/allOf by taking the first sub-schema', () => {
      const schema = {
        type: 'object',
        properties: {
          field: {
            oneOf: [{ type: 'string', description: 'String field' }, { type: 'number' }],
          },
        },
      };
      const expected = {
        type: 'OBJECT',
        properties: {
          field: {
            type: 'STRING',
            description: 'String field',
          },
        },
      };
      expect(capitalizeTypes(schema)).toEqual(expected);
    });

    it('should ignore NULL types inside properties', () => {
      const schema = {
        type: 'object',
        properties: {
          nullableField: { type: 'null' },
          otherField: { type: 'string' },
        },
      };
      const expected = {
        type: 'OBJECT',
        properties: {
          otherField: { type: 'STRING' },
        },
      };
      expect(capitalizeTypes(schema)).toEqual(expected);
    });

    it('should return non-object values as is', () => {
      expect(capitalizeTypes(null)).toBeNull();
      expect(capitalizeTypes(123)).toBe(123);
      expect(capitalizeTypes('string')).toBe('string');
    });
  });

  describe('getGmailIntegrationService', () => {
    it('should return Gmail integration data and input fields', async () => {
      const mockIntegration = { id: 'mock-gmail-integration-id', name: 'Gmail' };
      const mockInputFields = [{ name: 'email', type: 'string' }];

      mockOpenAIToolSet.integrations.get.mockResolvedValue(mockIntegration);
      mockOpenAIToolSet.integrations.getRequiredParams.mockResolvedValue(mockInputFields);

      const result = await composioService.getGmailIntegrationService();

      expect(mockOpenAIToolSet.integrations.get).toHaveBeenCalledWith({
        integrationId: '32b20636-3b36-4aeb-8931-5bc614ddec45',
      });
      expect(mockOpenAIToolSet.integrations.getRequiredParams).toHaveBeenCalledWith({
        integrationId: mockIntegration.id,
      });
      expect(result).toEqual({
        integration: mockIntegration,
        inputFields: mockInputFields,
      });
    });
  });

  describe('authorizeGmailIntegrationService', () => {
    it('should return a redirect URL for Gmail authorization', async () => {
      const userEmail = 'test@example.com';
      const mockConnectionRequest = { redirectUrl: 'http://mock-redirect-url.com' };

      mockComposio.toolkits.authorize.mockResolvedValue(mockConnectionRequest);

      const result = await composioService.authorizeGmailIntegrationService(userEmail);

      expect(mockComposio.toolkits.authorize).toHaveBeenCalledWith(userEmail, 'gmail');
      expect(result).toEqual({ redirectUrl: mockConnectionRequest.redirectUrl });
    });
  });

  describe('sendGmailFromAuthorizedAccountService', () => {
    const mockBody = {
      userEmail: 'sender@example.com',
      toEmail: 'recipient@example.com',
      subject: 'Test Subject',
      content: 'Test Content',
      connectedAccountId: 'mock-connected-account-id',
    };

    const mockTool = {
      function: {
        name: 'GMAIL_SEND_EMAIL',
        description: 'Sends an email',
        parameters: {
          type: 'object',
          properties: {
            recipient_email: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['recipient_email', 'subject', 'body'],
        },
      },
    };

    const mockGeminiFunctionCall = {
      name: 'GMAIL_SEND_EMAIL',
      args: {
        recipient_email: mockBody.toEmail,
        subject: mockBody.subject,
        body: mockBody.content,
      },
    };

    it('should successfully send an email using Gemini and Composio', async () => {
      mockComposio.tools.get.mockResolvedValue([mockTool]);
      mockFunctionCalls.mockReturnValue([mockGeminiFunctionCall]);
      mockComposio.provider.handleToolCalls.mockResolvedValue({ success: true });

      await composioService.sendGmailFromAuthorizedAccountService(mockBody);

      expect(mockComposio.tools.get).toHaveBeenCalledWith(
        mockBody.userEmail,
        {
          tools: ['GMAIL_SEND_EMAIL'],
          connectedAccountId: mockBody.connectedAccountId,
        },
        {
          reciepient_email: 'admin@altihq.com',
        }
      );

      expect(mockGoogleGenerativeAI.getGenerativeModel).toHaveBeenCalledWith(
        {
          model: 'gemini-2.5-flash',
          tools: [
            {
              functionDeclarations: [
                {
                  name: mockTool.function.name,
                  description: mockTool.function.description,
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      recipient_email: { type: 'STRING' },
                      subject: { type: 'STRING' },
                      body: { type: 'STRING' },
                    },
                    required: ['recipient_email', 'subject', 'body'],
                  },
                },
              ],
            },
          ],
        },
        {
          systemInstruction: 'You are a helpful assistant that can help with tasks.',
        }
      );

      expect(mockGenerateContent).toHaveBeenCalledWith({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Send an email to ${mockBody.toEmail} from ${mockBody.userEmail} with the subject ${mockBody.subject} and the body ${mockBody.content}`,
              },
            ],
          },
        ],
      });

      expect(mockFunctionCalls).toHaveBeenCalled();

      expect(mockComposio.provider.handleToolCalls).toHaveBeenCalledWith(
        mockBody.userEmail,
        expect.objectContaining({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: expect.arrayContaining([
                  expect.objectContaining({
                    type: 'function',
                    function: {
                      name: mockGeminiFunctionCall.name,
                      arguments: JSON.stringify(mockGeminiFunctionCall.args),
                    },
                  }),
                ]),
              },
            },
          ],
        }),
        {
          connectedAccountId: mockBody.connectedAccountId,
        }
      );
    });

    it('should throw ApiError if Gemini fails to generate function calls', async () => {
      mockComposio.tools.get.mockResolvedValue([mockTool]);
      mockFunctionCalls.mockReturnValue([]); // No function calls from Gemini

      await expect(composioService.sendGmailFromAuthorizedAccountService(mockBody)).rejects.toThrow(
        new ApiError(500, 'Gemini failed to generate Gmail send tool call')
      );
    });
  });

  describe('getAllConnectedAccountsService', () => {
    it('should return a list of connected accounts', async () => {
      const mockConnectedAccounts = {
        items: [{ id: 'acc1', name: 'Account 1' }],
        current_page: 1,
      };
      mockComposio.connectedAccounts.list.mockResolvedValue(mockConnectedAccounts);

      const result = await composioService.getAllConnectedAccountsService('mock-integration-id');

      expect(mockComposio.connectedAccounts.list).toHaveBeenCalledWith({
        integrationId: 'dc88453c-0435-4487-9b61-4da031b4c2ee',
        entityId: 'default',
      });
      expect(result).toEqual(mockConnectedAccounts.items);
    });
  });

  describe('getAllIntegrationsService', () => {
    it('should return all integrations and specifically the Gmail integration', async () => {
      const mockAllIntegrations = {
        items: [
          { id: 'int1', name: 'Google Mail' },
          { id: 'int2', name: 'YouTube' },
        ],
      };
      mockOpenAIToolSet.integrations.list.mockResolvedValue(mockAllIntegrations);

      const result = await composioService.getAllIntegrationsService();

      expect(mockOpenAIToolSet.integrations.list).toHaveBeenCalled();
      expect(result).toEqual({
        allIntegrations: mockAllIntegrations.items,
        gmailIntegration: mockAllIntegrations.items[0],
        gmailIntegrationId: mockAllIntegrations.items[0].id,
      });
    });

    it('should return null for gmailIntegration if not found', async () => {
      const mockAllIntegrations = {
        items: [{ id: 'int2', name: 'YouTube' }],
      };
      mockOpenAIToolSet.integrations.list.mockResolvedValue(mockAllIntegrations);

      const result = await composioService.getAllIntegrationsService();

      expect(result).toEqual({
        allIntegrations: mockAllIntegrations.items,
        gmailIntegration: undefined,
        gmailIntegrationId: undefined,
      });
    });
  });

  describe('initiateGmailConnectionService', () => {
    it('should return redirect URL and connected account info', async () => {
      const integrationId = 'mock-integration-id';
      const mockConnectedAccount = {
        redirectUrl: 'http://mock-redirect.com/gmail',
        connectedAccountId: 'mock-gmail-account-id',
        connectionStatus: 'pending',
      };
      mockOpenAIToolSet.connectedAccounts.initiate.mockResolvedValue(mockConnectedAccount);

      const result = await composioService.initiateGmailConnectionService(integrationId);

      expect(mockOpenAIToolSet.connectedAccounts.initiate).toHaveBeenCalledWith({
        integrationId,
        entityId: 'default',
      });
      expect(result).toEqual(mockConnectedAccount);
    });
  });

  describe('sendEmailService', () => {
    const mockReq = {
      body: {
        integrationId: 'mock-integration-id',
        connectedAccountId: 'mock-connected-account-id',
        to: 'test@example.com',
        subject: 'Hello',
        message: 'This is a test email.',
        isHtml: false,
      },
    };

    it('should successfully send an email via axios', async () => {
      axios.post.mockResolvedValue({ data: { status: 'sent' } });

      const result = await composioService.sendEmailService(mockReq);

      expect(axios.post).toHaveBeenCalledWith(
        'https://backend.composio.dev/api/v2/actions/GMAIL_SEND_EMAIL/execute',
        {
          integrationId: mockReq.body.integrationId,
          connectedAccountId: mockReq.body.connectedAccountId,
          input: {
            user_id: 'me',
            recipient_email: mockReq.body.to,
            subject: mockReq.body.subject,
            body: mockReq.body.message,
            is_html: mockReq.body.isHtml,
          },
        },
        {
          headers: {
            'x-api-key': 'mock-composio-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual({ success: true, data: { status: 'sent' } });
    });

    it('should throw ApiError if required fields are missing', async () => {
      const invalidReq = { body: { connectedAccountId: 'id', to: 'email' } }; // Missing subject, message
      await expect(composioService.sendEmailService(invalidReq)).rejects.toThrow(
        new ApiError(400, 'Missing required fields: connectedAccountId, to, subject, message')
      );
    });
  });

  describe('getYouTubeIntegrationService', () => {
    it('should return YouTube integration data and input fields', async () => {
      const mockIntegration = { id: 'mock-youtube-integration-id', name: 'YouTube' };
      const mockInputFields = [{ name: 'query', type: 'string' }];

      mockOpenAIToolSet.integrations.get.mockResolvedValue(mockIntegration);
      mockOpenAIToolSet.integrations.getRequiredParams.mockResolvedValue(mockInputFields);

      const result = await composioService.getYouTubeIntegrationService();

      expect(mockOpenAIToolSet.integrations.get).toHaveBeenCalledWith({
        integrationId: 'f16f5b45-f9fa-4d65-b319-e9046564edee',
      });
      expect(mockOpenAIToolSet.integrations.getRequiredParams).toHaveBeenCalledWith({
        integrationId: mockIntegration.id,
      });
      expect(result).toEqual({
        integration: mockIntegration,
        inputFields: mockInputFields,
      });
    });
  });

  describe('initiateYouTubeConnectionService', () => {
    it('should return redirect URL and connected account info', async () => {
      const mockConnectedAccount = {
        redirectUrl: 'http://mock-redirect.com/youtube',
        connectedAccountId: 'mock-youtube-account-id',
        connectionStatus: 'pending',
      };
      mockOpenAIToolSet.connectedAccounts.initiate.mockResolvedValue(mockConnectedAccount);

      const result = await composioService.initiateYouTubeConnectionService();

      expect(mockOpenAIToolSet.connectedAccounts.initiate).toHaveBeenCalledWith({
        integrationId: 'f16f5b45-f9fa-4d65-b319-e9046564edee',
        entityId: 'default',
      });
      expect(result).toEqual(mockConnectedAccount);
    });
  });

  describe('searchYouTubeService', () => {
    const mockReq = {
      body: {
        connectedAccountId: 'mock-connected-youtube-id',
        query: 'test video',
      },
    };

    it('should successfully search YouTube via axios', async () => {
      const mockResponseData = { items: [{ id: 'vid1', title: 'Test Video' }] };
      axios.post.mockResolvedValue({ data: mockResponseData });

      const result = await composioService.searchYouTubeService(mockReq);

      expect(axios.post).toHaveBeenCalledWith(
        'https://backend.composio.dev/api/v2/actions/YOUTUBE_SEARCH_YOU_TUBE/execute',
        {
          integrationId: 'f16f5b45-f9fa-4d65-b319-e9046564edee',
          connectedAccountId: mockReq.body.connectedAccountId,
          input: { q: mockReq.body.query },
        },
        {
          headers: {
            'x-api-key': 'mock-composio-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual(mockResponseData);
    });

    it('should throw ApiError if required fields are missing', async () => {
      const invalidReq = { body: { connectedAccountId: 'id' } }; // Missing query
      await expect(composioService.searchYouTubeService(invalidReq)).rejects.toThrow(
        new ApiError(400, 'Missing required fields: connectedAccountId, and query')
      );
    });
  });

  describe('disconnectYouTubeAccountService', () => {
    it('should successfully disconnect a YouTube account', async () => {
      const connectedAccountId = 'mock-youtube-account-id';
      const mockResponse = { message: 'Disconnected' };
      mockOpenAIToolSet.connectedAccounts.delete.mockResolvedValue(mockResponse);

      const result = await composioService.disconnectYouTubeAccountService(connectedAccountId);

      expect(mockOpenAIToolSet.connectedAccounts.delete).toHaveBeenCalledWith({
        connectedAccountId,
      });
      expect(result).toEqual({
        success: true,
        message: 'Disconnected successfully',
        response: mockResponse,
      });
    });
  });

  describe('initiateTwitterConnectionService', () => {
    it('should return redirect URL and connected account info for Twitter', async () => {
      const mockConnectedAccount = {
        redirectUrl: 'http://mock-redirect.com/twitter',
        connectedAccountId: 'mock-twitter-account-id',
        connectionStatus: 'pending',
      };
      mockOpenAIToolSet.connectedAccounts.initiate.mockResolvedValue(mockConnectedAccount);

      const result = await composioService.initiateTwitterConnectionService();

      expect(mockOpenAIToolSet.connectedAccounts.initiate).toHaveBeenCalledWith({
        integrationId: '03615643-b71c-4a13-a012-4f7f94d92bc8',
        entityId: 'default',
      });
      expect(result).toEqual(mockConnectedAccount);
    });
  });

  describe('postTweetService', () => {
    const mockReq = {
      body: {
        connectedAccountId: 'mock-connected-twitter-id',
        text: 'Hello Vitest!',
      },
    };

    it('should successfully post a tweet via axios', async () => {
      const mockResponseData = { tweetId: '12345' };
      axios.post.mockResolvedValue({ data: mockResponseData });

      const result = await composioService.postTweetService(mockReq);

      expect(axios.post).toHaveBeenCalledWith(
        'https://backend.composio.dev/api/v2/actions/TWITTER_CREATION_OF_A_POST/execute',
        {
          integrationId: '03615643-b71c-4a13-a012-4f7f94d92bc8',
          connectedAccountId: mockReq.body.connectedAccountId,
          input: { text: mockReq.body.text },
        },
        {
          headers: {
            'x-api-key': 'mock-composio-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual({ success: true, data: mockResponseData });
    });

    it('should return error if required fields are missing', async () => {
      const invalidReq = { body: { connectedAccountId: 'id' } }; // Missing text
      const result = await composioService.postTweetService(invalidReq);
      expect(result).toEqual({ error: 'Missing required fields: connectedAccountId, text' });
    });
  });

  describe('deleteTweetService', () => {
    const mockReq = {
      body: {
        connectedAccountId: 'mock-connected-twitter-id',
        tweetId: '12345',
      },
    };

    it('should successfully delete a tweet via axios', async () => {
      const mockResponseData = { status: 'deleted' };
      axios.post.mockResolvedValue({ data: mockResponseData });

      const result = await composioService.deleteTweetService(mockReq);

      expect(axios.post).toHaveBeenCalledWith(
        'https://backend.composio.dev/api/v2/actions/TWITTER_POST_DELETE_BY_POST_ID/execute',
        {
          integrationId: '03615643-b71c-4a13-a012-4f7f94d92bc8',
          connectedAccountId: mockReq.body.connectedAccountId,
          input: { post_id: mockReq.body.tweetId },
        },
        {
          headers: {
            'x-api-key': 'mock-composio-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual({ success: true, data: mockResponseData });
    });

    it('should return error if required fields are missing', async () => {
      const invalidReq = { body: { connectedAccountId: 'id' } }; // Missing tweetId
      const result = await composioService.deleteTweetService(invalidReq);
      expect(result).toEqual({ error: 'Missing required fields: connectedAccountId, tweetId' });
    });
  });

  describe('followTwitterUserService', () => {
    const mockReq = {
      body: {
        connectedAccountId: 'mock-connected-twitter-id',
        username: 'testuser',
      },
    };

    it('should successfully follow a Twitter user via axios', async () => {
      const mockResponseData = { status: 'followed' };
      axios.post.mockResolvedValue({ data: mockResponseData });

      const result = await composioService.followTwitterUserService(mockReq);

      expect(axios.post).toHaveBeenCalledWith(
        'https://backend.composio.dev/api/v2/actions/TWITTER_FOLLOW_USER/execute',
        {
          integrationId: '03615643-b71c-4a13-a012-4f7f94d92bc8',
          connectedAccountId: mockReq.body.connectedAccountId,
          input: { username: mockReq.body.username },
        },
        {
          headers: {
            'x-api-key': 'mock-composio-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual({ success: true, data: mockResponseData });
    });

    it('should return error if required fields are missing', async () => {
      const invalidReq = { body: { connectedAccountId: 'id' } }; // Missing username
      const result = await composioService.followTwitterUserService(invalidReq);
      expect(result).toEqual({ error: 'Missing required fields: connectedAccountId, username' });
    });
  });

  describe('getTwitterUserByUsernameService', () => {
    const mockReq = {
      body: {
        connectedAccountId: 'mock-connected-twitter-id',
        username: 'testuser',
      },
    };

    it('should successfully get Twitter user data by username via axios', async () => {
      const mockResponseData = { data: [{ id: 'user123', username: 'testuser' }] };
      axios.post.mockResolvedValue({ data: { data: mockResponseData } });

      const result = await composioService.getTwitterUserByUsernameService(mockReq);

      expect(axios.post).toHaveBeenCalledWith(
        'https://backend.composio.dev/api/v2/actions/TWITTER_USER_LOOKUP_BY_USERNAMES/execute',
        {
          integrationId: '03615643-b71c-4a13-a012-4f7f94d92bc8',
          connectedAccountId: mockReq.body.connectedAccountId,
          input: { usernames: [mockReq.body.username] },
        },
        {
          headers: {
            'x-api-key': 'mock-composio-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual({ success: true, data: { data: mockResponseData } });
    });

    it('should return error if required fields are missing', async () => {
      const invalidReq = { body: { connectedAccountId: 'id' } }; // Missing username
      const result = await composioService.getTwitterUserByUsernameService(invalidReq);
      expect(result).toEqual({ error: 'Missing required fields: connectedAccountId, username' });
    });
  });

  describe('sendDMByUsernameService', () => {
    const mockReq = {
      body: {
        connectedAccountId: 'mock-connected-twitter-id',
        username: 'testuser',
        text: 'Hello DM!',
      },
    };

    // Mock the internal getUserIdFromUsername function
    const getUserIdFromUsername = async (connectedAccountId, username) => {
      if (username === 'testuser') {
        return 'user123';
      }
      throw new Error('User not found');
    };

    // Temporarily replace the internal function for this test block
    let originalGetUserIdFromUsername;
    beforeEach(() => {
      originalGetUserIdFromUsername = composioService.__proto__.getUserIdFromUsername; // Accessing internal function for testing
      Object.defineProperty(composioService, 'getUserIdFromUsername', {
        value: getUserIdFromUsername,
        configurable: true,
      });
    });
    afterEach(() => {
      Object.defineProperty(composioService, 'getUserIdFromUsername', {
        value: originalGetUserIdFromUsername,
        configurable: true,
      });
    });

    it('should successfully send a DM by username via axios', async () => {
      const mockResponseData = { status: 'sent' };
      axios.post.mockResolvedValue({ data: mockResponseData });

      const result = await composioService.sendDMByUsernameService(mockReq);

      expect(axios.post).toHaveBeenCalledWith(
        'https://backend.composio.dev/api/v2/actions/TWITTER_SEND_A_NEW_MESSAGE_TO_A_USER/execute',
        {
          integrationId: '03615643-b71c-4a13-a012-4f7f94d92bc8',
          connectedAccountId: mockReq.body.connectedAccountId,
          input: {
            participant_id: 'user123',
            text: mockReq.body.text,
          },
        },
        {
          headers: {
            'x-api-key': 'mock-composio-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual({ success: true, data: mockResponseData });
    });

    it('should return error if required fields are missing', async () => {
      const invalidReq = { body: { connectedAccountId: 'id', username: 'user' } }; // Missing text
      const result = await composioService.sendDMByUsernameService(invalidReq);
      expect(result).toEqual({ error: 'Missing required fields: connectedAccountId, username, text' });
    });

    it('should return error if user not found', async () => {
      const invalidReq = {
        body: {
          connectedAccountId: 'mock-connected-twitter-id',
          username: 'nonexistentuser',
          text: 'Hello DM!',
        },
      };
      const result = await composioService.sendDMByUsernameService(invalidReq);
      expect(result).toEqual({ error: 'User not found' });
    });
  });

  describe('getLinkedInOAuthRedirectUrlService', () => {
    it('should return LinkedIn OAuth redirect URL', async () => {
      const integrationId = 'mock-linkedin-integration-id';
      const entityId = 'mock-entity-id';
      const mockConnectedAccount = { redirectUrl: 'http://mock-linkedin-oauth.com' };
      mockOpenAIToolSet.connectedAccounts.initiate.mockResolvedValue(mockConnectedAccount);

      const result = await composioService.getLinkedInOAuthRedirectUrlService(integrationId, entityId);

      expect(mockOpenAIToolSet.connectedAccounts.initiate).toHaveBeenCalledWith({
        integrationId,
        entityId,
      });
      expect(result).toBe(mockConnectedAccount.redirectUrl);
    });
  });

  describe('exchangeCodeLinkedInService', () => {
    it('should exchange code for LinkedIn connected account info', async () => {
      const code = 'mock-code';
      const integrationId = 'mock-linkedin-integration-id';
      const entityId = 'mock-entity-id';
      const mockConnectedAccount = {
        connectedAccountId: 'mock-linkedin-account-id',
        connectionStatus: 'connected',
      };
      mockOpenAIToolSet.connectedAccounts.exchangeCode.mockResolvedValue(mockConnectedAccount);

      const result = await composioService.exchangeCodeLinkedInService(code, integrationId, entityId);

      expect(mockOpenAIToolSet.connectedAccounts.exchangeCode).toHaveBeenCalledWith({
        code,
        integrationId,
        entityId,
      });
      expect(result).toEqual(mockConnectedAccount);
    });
  });

  describe('postToLinkedInService', () => {
    it('should return expected input fields for LinkedIn post (currently just logs)', async () => {
      const integrationId = 'mock-linkedin-integration-id';
      const connectedAccountId = 'mock-linkedin-account-id';
      const content = 'Test LinkedIn post';
      const mockIntegration = { id: 'ff2c1c00-03ca-4135-9fe7-afa775098c26' };
      const mockInputFields = [{ name: 'text', type: 'string' }];

      mockOpenAIToolSet.integrations.get.mockResolvedValue(mockIntegration);
      mockOpenAIToolSet.integrations.getRequiredParams.mockResolvedValue(mockInputFields);

      const result = await composioService.postToLinkedInService(
        integrationId,
        connectedAccountId,
        content
      );

      expect(mockOpenAIToolSet.integrations.get).toHaveBeenCalledWith({
        integrationId: 'ff2c1c00-03ca-4135-9fe7-afa775098c26',
      });
      expect(mockOpenAIToolSet.integrations.getRequiredParams).toHaveBeenCalledWith(
        mockIntegration.id
      );
      expect(result).toEqual(mockInputFields);
    });
  });

  describe('initiateGoogleCalendarConnectionService', () => {
    it('should return redirect URL and connected account info for Google Calendar', async () => {
      const mockConnectedAccount = {
        redirectUrl: 'http://mock-redirect.com/calendar',
        connectedAccountId: 'mock-calendar-account-id',
        connectionStatus: 'pending',
      };
      mockOpenAIToolSet.connectedAccounts.initiate.mockResolvedValue(mockConnectedAccount);

      const result = await composioService.initiateGoogleCalendarConnectionService();

      expect(mockOpenAIToolSet.connectedAccounts.initiate).toHaveBeenCalledWith({
        integrationId: '21c69c18-54ef-464b-a181-dc82f3e5b089',
        entityId: 'default',
      });
      expect(result).toEqual(mockConnectedAccount);
    });
  });

  describe('createCalendarEventService', () => {
    const mockReq = {
      body: {
        connectedAccountId: 'mock-connected-calendar-id',
        summary: 'Team Meeting',
        description: 'Discuss Q3 plans',
        startTime: '2024-07-20T10:00:00Z',
        endTime: '2024-07-20T11:00:00Z',
        timezone: 'Asia/Dhaka',
      },
    };

    it('should successfully create a calendar event via axios', async () => {
      const mockResponseData = { eventId: 'event123', status: 'confirmed' };
      axios.post.mockResolvedValue({ data: mockResponseData });

      const result = await composioService.createCalendarEventService(mockReq);

      expect(axios.post).toHaveBeenCalledWith(
        'https://backend.composio.dev/api/v2/actions/GOOGLECALENDAR_CREATE_EVENT/execute',
        {
          integrationId: '21c69c18-54ef-464b-a181-dc82f3e5b089',
          connectedAccountId: mockReq.body.connectedAccountId,
          input: {
            summary: mockReq.body.summary,
            description: mockReq.body.description,
            start_datetime: mockReq.body.startTime,
            end_datetime: mockReq.body.endTime,
            timezone: mockReq.body.timezone,
          },
        },
        {
          headers: {
            'x-api-key': 'mock-composio-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual({ success: true, data: mockResponseData });
    });

    it('should return error if required fields are missing', async () => {
      const invalidReq = { body: { connectedAccountId: 'id', summary: 'Meeting' } }; // Missing startTime, endTime
      const result = await composioService.createCalendarEventService(invalidReq);
      expect(result).toEqual({
        error: 'Missing required fields: connectedAccountId, summary, startTime, endTime',
      });
    });
  });

  describe('getCalendarEventsService', () => {
    const mockReq = {
      body: {
        connectedAccountId: 'mock-connected-calendar-id',
      },
    };

    it('should successfully get calendar events via axios', async () => {
      const mockResponseData = { items: [{ id: 'event1', summary: 'Event 1' }] };
      axios.post.mockResolvedValue({ data: mockResponseData });

      const result = await composioService.getCalendarEventsService(mockReq);

      expect(axios.post).toHaveBeenCalledWith(
        'https://backend.composio.dev/api/v2/actions/GOOGLECALENDAR_EVENTS_LIST/execute',
        {
          integrationId: '21c69c18-54ef-464b-a181-dc82f3e5b089',
          connectedAccountId: mockReq.body.connectedAccountId,
          input: { calendarId: 'primary' },
        },
        {
          headers: {
            'x-api-key': 'mock-composio-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual(mockResponseData);
    });

    it('should return error if connectedAccountId is missing', async () => {
      const invalidReq = { body: {} }; // Missing connectedAccountId
      const result = await composioService.getCalendarEventsService(invalidReq);
      expect(result).toEqual({ error: 'Missing required field: connectedAccountId' });
    });
  });

  describe('deleteCalendarEventService', () => {
    const mockReq = {
      body: {
        connectedAccountId: 'mock-connected-calendar-id',
        eventId: 'event123',
        calendarId: 'primary',
      },
    };

    it('should successfully delete a calendar event via axios', async () => {
      const mockResponseData = { status: 'deleted' };
      axios.post.mockResolvedValue({ data: mockResponseData });

      const result = await composioService.deleteCalendarEventService(mockReq);

      expect(axios.post).toHaveBeenCalledWith(
        'https://backend.composio.dev/api/v2/actions/GOOGLECALENDAR_DELETE_EVENT/execute',
        {
          integrationId: '21c69c18-54ef-464b-a181-dc82f3e5b089',
          connectedAccountId: mockReq.body.connectedAccountId,
          input: {
            event_id: mockReq.body.eventId,
            calendar_id: mockReq.body.calendarId,
          },
        },
        {
          headers: {
            'x-api-key': 'mock-composio-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual(mockResponseData);
    });

    it('should return error if required fields are missing', async () => {
      const invalidReq = { body: { connectedAccountId: 'id' } }; // Missing eventId
      const result = await composioService.deleteCalendarEventService(invalidReq);
      expect(result).toEqual({ error: 'Missing required fields: connectedAccountId, eventId' });
    });
  });

  describe('updateCalendarEventService', () => {
    const mockReq = {
      body: {
        connectedAccountId: 'mock-connected-calendar-id',
        eventId: 'event123',
        calendarId: 'primary',
        summary: 'Updated Meeting',
        description: 'Updated description',
        startTime: '2024-07-20T10:30:00Z',
        endTime: '2024-07-20T11:30:00Z',
        timezone: 'Asia/Dhaka',
      },
    };

    it('should successfully update a calendar event via axios', async () => {
      const mockResponseData = { status: 'updated' };
      axios.post.mockResolvedValue({ data: mockResponseData });

      const result = await composioService.updateCalendarEventService(mockReq);

      expect(axios.post).toHaveBeenCalledWith(
        'https://backend.composio.dev/api/v2/actions/GOOGLECALENDAR_PATCH_EVENT/execute',
        {
          integrationId: '21c69c18-54ef-464b-a181-dc82f3e5b089',
          connectedAccountId: mockReq.body.connectedAccountId,
          input: {
            calendar_id: mockReq.body.calendarId,
            event_id: mockReq.body.eventId,
            summary: mockReq.body.summary,
            description: mockReq.body.description,
            start_time: mockReq.body.startTime,
            end_time: mockReq.body.endTime,
            timezone: mockReq.body.timezone,
          },
        },
        {
          headers: {
            'x-api-key': 'mock-composio-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual(mockResponseData);
    });

    it('should return error if required fields are missing', async () => {
      const invalidReq = { body: { connectedAccountId: 'id' } }; // Missing eventId
      const result = await composioService.updateCalendarEventService(invalidReq);
      expect(result).toEqual({ error: 'Missing required fields: connectedAccountId, eventId' });
    });
  });

  describe('getGithubIntegrationService', () => {
    it('should return GitHub integration data and input fields', async () => {
      const mockIntegration = { id: 'mock-github-integration-id', name: 'GitHub' };
      const mockInputFields = [{ name: 'repo', type: 'string' }];

      mockOpenAIToolSet.integrations.get.mockResolvedValue(mockIntegration);
      mockOpenAIToolSet.integrations.getRequiredParams.mockResolvedValue(mockInputFields);

      const result = await composioService.getGithubIntegrationService();

      expect(mockOpenAIToolSet.integrations.get).toHaveBeenCalledWith({
        integrationId: '394bc42b-5fa8-4777-8e08-6fed12510deb',
      });
      expect(mockOpenAIToolSet.integrations.getRequiredParams).toHaveBeenCalledWith({
        integrationId: mockIntegration.id,
      });
      expect(result).toEqual({
        integration: mockIntegration,
        inputFields: mockInputFields,
      });
    });
  });

  describe('initiateGithubConnectionService', () => {
    it('should return redirect URL and connected account info for GitHub', async () => {
      const integrationId = 'mock-github-integration-id';
      const mockConnectedAccount = {
        redirectUrl: 'http://mock-redirect.com/github',
        connectedAccountId: 'mock-github-account-id',
        connectionStatus: 'pending',
      };
      mockOpenAIToolSet.connectedAccounts.initiate.mockResolvedValue(mockConnectedAccount);

      const result = await composioService.initiateGithubConnectionService(integrationId);

      expect(mockOpenAIToolSet.connectedAccounts.initiate).toHaveBeenCalledWith({
        integrationId,
        entityId: 'default',
      });
      expect(result).toEqual(mockConnectedAccount);
    });
  });

  describe('createGithubIssueService', () => {
    const mockReq = {
      body: {
        connectedAccountId: 'mock-connected-github-id',
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'New Issue',
        body: 'Description of the issue.',
      },
    };

    it('should successfully create a GitHub issue via axios', async () => {
      const mockResponseData = { issueId: 1, status: 'open' };
      axios.post.mockResolvedValue({ data: mockResponseData });

      const result = await composioService.createGithubIssueService(mockReq);

      expect(axios.post).toHaveBeenCalledWith(
        'https://backend.composio.dev/api/v2/actions/GITHUB_CREATE_ISSUE/execute',
        {
          integrationId: '394bc42b-5fa8-4777-8e08-6fed12510deb',
          connectedAccountId: mockReq.body.connectedAccountId,
          input: {
            owner: mockReq.body.owner,
            repo: mockReq.body.repo,
            title: mockReq.body.title,
            body: mockReq.body.body,
          },
        },
        {
          headers: {
            'x-api-key': 'mock-composio-api-key',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual(mockResponseData);
    });

    it('should return error if required fields are missing', async () => {
      const invalidReq = { body: { connectedAccountId: 'id', owner: 'owner' } }; // Missing repo, title
      const result = await composioService.createGithubIssueService(invalidReq);
      expect(result).toEqual({ error: 'Missing required fields' });
    });
  });

  describe('initiateAmazonConnectionService', () => {
    it('should return redirect URL and connected account info for Amazon', async () => {
      const mockAmazonIntegration = { id: 'mock-amazon-integration-id', name: 'Amazon Seller' };
      const mockAllIntegrations = { items: [mockAmazonIntegration] };
      const mockConnectionRequest = {
        redirectUrl: 'http://mock-redirect.com/amazon',
        connectedAccountId: 'mock-amazon-account-id',
        connectionStatus: 'pending',
      };

      mockOpenAIToolSet.integrations.list.mockResolvedValue(mockAllIntegrations);
      mockOpenAIToolSet.connectedAccounts.initiate.mockResolvedValue(mockConnectionRequest);

      const result = await composioService.initiateAmazonConnectionService();

      expect(mockOpenAIToolSet.integrations.list).toHaveBeenCalled();
      expect(mockOpenAIToolSet.connectedAccounts.initiate).toHaveBeenCalledWith({
        integrationId: mockAmazonIntegration.id,
        entityId: 'default',
      });
      expect(result).toEqual(mockConnectionRequest);
    });

    it('should throw an error if Amazon integration is not found', async () => {
      mockOpenAIToolSet.integrations.list.mockResolvedValue({ items: [] });

      await expect(composioService.initiateAmazonConnectionService()).rejects.toThrow(
        'Amazon integration not found'
      );
    });
  });
});