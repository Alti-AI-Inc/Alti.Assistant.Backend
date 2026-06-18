import { describe, it, expect } from 'vitest';
import { ConversationValidation } from './conversation.validation';

const VALID_UUID = '10a97bfb-12a4-44b4-82a1-6a2d1e2e92c2';
const ANOTHER_UUID = '10a97bfb-12a4-44b4-82a1-6a2d1e2e92c3';
const VALID_SHARE_UUID = '10a97bfb-12a4-44b4-82a1-6a2d1e2e92c4';

// Helper function to validate and expect success
const expectValid = (schema, data) => {
  const result = schema.safeParse(data);
  expect(result.success).toBe(true, `Schema validation failed for valid data: ${JSON.stringify(data)} - Errors: ${JSON.stringify(result.error?.issues)}`);
  return result.data;
};

// Helper function to validate and expect failure
const expectInvalid = (schema, data, expectedErrors = []) => {
  const result = schema.safeParse(data);
  expect(result.success).toBe(false, `Schema validation unexpectedly succeeded for invalid data: ${JSON.stringify(data)}`);
  if (expectedErrors.length > 0) {
    const issues = result.error.issues.map(issue => ({
      path: issue.path,
      message: issue.message,
    }));
    expect(issues).toEqual(expect.arrayContaining(expectedErrors));
  }
  return result.error;
};

describe('ConversationValidation', () => {

  // Test messageSchema (accessed via addMessageSchema.shape.body)
  describe('messageSchema', () => {
    const schema = ConversationValidation.addMessageSchema.shape.body;

    it('should validate a minimal valid message', () => {
      const message = { role: 'user', content: 'Hello' };
      expectValid(schema, message);
    });

    it('should validate a message with optional metadata', () => {
      const message = { role: 'assistant', content: 'Hi there', metadata: { key: 'value' } };
      expectValid(schema, message);
    });

    it('should invalidate a message with missing role', () => {
      const message = { content: 'Hello' };
      expectInvalid(schema, message, [{ path: ['role'], message: 'Message role is required' }]);
    });

    it('should invalidate a message with invalid role', () => {
      const message = { role: 'invalid', content: 'Hello' };
      expectInvalid(schema, message, [{ path: ['role'], message: 'Role must be user, assistant, or system' }]);
    });

    it('should invalidate a message with missing content', () => {
      const message = { role: 'user' };
      expectInvalid(schema, message, [{ path: ['content'], message: 'Message content is required' }]);
    });

    it('should invalidate a message with empty content', () => {
      const message = { role: 'user', content: '' };
      expectInvalid(schema, message, [{ path: ['content'], message: 'Message content cannot be empty' }]);
    });
  });

  // Test createConversationSchema
  describe('createConversationSchema', () => {
    const schema = ConversationValidation.createConversationSchema;

    it('should validate a minimal valid create conversation request', () => {
      const data = { body: {} };
      expectValid(schema, data);
    });

    it('should validate a full valid create conversation request', () => {
      const data = {
        body: {
          title: 'My New Chat',
          initialMessage: { role: 'user', content: 'First message' },
          metadata: { model: 'gpt-4', temperature: 0.5, maxTokens: 1000, tags: ['test'], category: 'coding', customData: { a: 1 } },
          is_deep_search: true,
        },
      };
      expectValid(schema, data);
    });

    it('should invalidate if title is too long', () => {
      const data = { body: { title: 'a'.repeat(256) } };
      expectInvalid(schema, data, [{ path: ['body', 'title'], message: 'Title must be less than 255 characters' }]);
    });

    it('should invalidate if initialMessage is invalid (e.g., missing role)', () => {
      const data = { body: { initialMessage: { content: 'test' } } };
      expectInvalid(schema, data, [{ path: ['body', 'initialMessage', 'role'], message: 'Message role is required' }]);
    });

    it('should invalidate if metadata temperature is out of range (too high)', () => {
      const data = { body: { metadata: { temperature: 3 } } };
      expectInvalid(schema, data, [{ path: ['body', 'metadata', 'temperature'], message: 'Number must be less than or equal to 2' }]);
    });

    it('should invalidate if metadata temperature is out of range (too low)', () => {
      const data = { body: { metadata: { temperature: -0.1 } } };
      expectInvalid(schema, data, [{ path: ['body', 'metadata', 'temperature'], message: 'Number must be greater than or equal to 0' }]);
    });

    it('should invalidate if metadata maxTokens is not positive', () => {
      const data = { body: { metadata: { maxTokens: 0 } } };
      expectInvalid(schema, data, [{ path: ['body', 'metadata', 'maxTokens'], message: 'Number must be greater than 0' }]);
    });

    it('should invalidate if is_deep_search is not a boolean', () => {
      const data = { body: { is_deep_search: 'true' } };
      expectInvalid(schema, data, [{ path: ['body', 'is_deep_search'], message: 'Expected boolean, received string' }]);
    });
  });

  // Test addMessageSchema
  describe('addMessageSchema', () => {
    const schema = ConversationValidation.addMessageSchema;

    it('should validate a valid add message request', () => {
      const data = {
        body: { role: 'user', content: 'New message' },
        params: { conversationId: VALID_UUID },
      };
      expectValid(schema, data);
    });

    it('should invalidate if conversationId is missing in params', () => {
      const data = {
        body: { role: 'user', content: 'New message' },
        params: {},
      };
      expectInvalid(schema, data, [{ path: ['params', 'conversationId'], message: 'Conversation ID is required' }]);
    });

    it('should invalidate if message body is invalid (e.g., missing content)', () => {
      const data = {
        body: { role: 'assistant' },
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body', 'content'], message: 'Message content is required' }]);
    });
  });

  // Test updateTitleSchema
  describe('updateTitleSchema', () => {
    const schema = ConversationValidation.updateTitleSchema;

    it('should validate a valid update title request', () => {
      const data = {
        body: { title: 'Updated Title' },
        params: { conversationId: VALID_UUID },
      };
      expectValid(schema, data);
    });

    it('should invalidate if title is missing', () => {
      const data = {
        body: {},
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body', 'title'], message: 'Title is required' }]);
    });

    it('should invalidate if title is empty', () => {
      const data = {
        body: { title: '' },
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body', 'title'], message: 'Title cannot be empty' }]);
    });

    it('should invalidate if title is too long', () => {
      const data = {
        body: { title: 'b'.repeat(256) },
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body', 'title'], message: 'Title must be less than 255 characters' }]);
    });

    it('should invalidate if conversationId is missing in params', () => {
      const data = {
        body: { title: 'Updated Title' },
        params: {},
      };
      expectInvalid(schema, data, [{ path: ['params', 'conversationId'], message: 'Conversation ID is required' }]);
    });
  });

  // Test updateMetadataSchema
  describe('updateMetadataSchema', () => {
    const schema = ConversationValidation.updateMetadataSchema;

    it('should validate a valid update metadata request', () => {
      const data = {
        body: { metadata: { model: 'gpt-3.5', temperature: 1.0 } },
        params: { conversationId: VALID_UUID },
      };
      expectValid(schema, data);
    });

    it('should validate with partial metadata updates', () => {
      const data = {
        body: { metadata: { tags: ['new-tag'] } },
        params: { conversationId: VALID_UUID },
      };
      expectValid(schema, data);
    });

    it('should invalidate if metadata temperature is out of range', () => {
      const data = {
        body: { metadata: { temperature: -0.5 } },
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body', 'metadata', 'temperature'], message: 'Number must be greater than or equal to 0' }]);
    });

    it('should invalidate if metadata maxTokens is not positive', () => {
      const data = {
        body: { metadata: { maxTokens: -100 } },
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body', 'metadata', 'maxTokens'], message: 'Number must be greater than 0' }]);
    });

    it('should invalidate if conversationId is missing in params', () => {
      const data = {
        body: { metadata: { model: 'gpt-3.5' } },
        params: {},
      };
      expectInvalid(schema, data, [{ path: ['params', 'conversationId'], message: 'Conversation ID is required' }]);
    });
  });

  // Test conversationParamsSchema
  describe('conversationParamsSchema', () => {
    const schema = ConversationValidation.conversationParamsSchema;

    it('should validate a valid conversation params request', () => {
      const data = { params: { conversationId: VALID_UUID } };
      expectValid(schema, data);
    });

    it('should invalidate if conversationId is missing in params', () => {
      const data = { params: {} };
      expectInvalid(schema, data, [{ path: ['params', 'conversationId'], message: 'Conversation ID is required' }]);
    });
  });

  // Test getUserConversationsSchema
  describe('getUserConversationsSchema', () => {
    const schema = ConversationValidation.getUserConversationsSchema;

    it('should validate a minimal valid get user conversations request', () => {
      const data = { query: {} };
      expectValid(schema, data);
    });

    it('should validate a full valid get user conversations request', () => {
      const data = {
        query: {
          page: '1',
          limit: '10',
          status: 'active',
          sortBy: 'createdAt',
          sortOrder: '-1',
          search: 'query',
          category: 'work',
          is_deep_search: 'true',
        },
      };
      expectValid(schema, data);
    });

    it('should invalidate if page is not a number string', () => {
      const data = { query: { page: 'abc' } };
      expectInvalid(schema, data, [{ path: ['query', 'page'], message: 'Page must be a number' }]);
    });

    it('should invalidate if limit is not a number string', () => {
      const data = { query: { limit: 'xyz' } };
      expectInvalid(schema, data, [{ path: ['query', 'limit'], message: 'Limit must be a number' }]);
    });

    it('should invalidate if status is invalid', () => {
      const data = { query: { status: 'pending' } };
      expectInvalid(schema, data, [{ path: ['query', 'status'], message: "Invalid enum value. Expected 'active' | 'archived' | 'deleted', received 'pending'" }]);
    });

    it('should invalidate if sortOrder is invalid', () => {
      const data = { query: { sortOrder: '0' } };
      expectInvalid(schema, data, [{ path: ['query', 'sortOrder'], message: 'Sort order must be 1 or -1' }]);
    });

    it('should invalidate if is_deep_search is invalid', () => {
      const data = { query: { is_deep_search: 'yes' } };
      expectInvalid(schema, data, [{ path: ['query', 'is_deep_search'], message: 'is_deep_search must be true or false' }]);
    });
  });

  // Test getConversationMessagesSchema
  describe('getConversationMessagesSchema', () => {
    const schema = ConversationValidation.getConversationMessagesSchema;

    it('should validate a valid get conversation messages request', () => {
      const data = {
        params: { conversationId: VALID_UUID },
        query: { page: '1', limit: '5' },
      };
      expectValid(schema, data);
    });

    it('should validate with beforeDate', () => {
      const data = {
        params: { conversationId: VALID_UUID },
        query: { beforeDate: '2023-01-01T00:00:00.000Z' },
      };
      expectValid(schema, data);
    });

    it('should invalidate if conversationId is missing in params', () => {
      const data = {
        params: {},
        query: {},
      };
      expectInvalid(schema, data, [{ path: ['params', 'conversationId'], message: 'Conversation ID is required' }]);
    });

    it('should invalidate if page is not a number string', () => {
      const data = {
        params: { conversationId: VALID_UUID },
        query: { page: 'invalid' },
      };
      expectInvalid(schema, data, [{ path: ['query', 'page'], message: 'Page must be a number' }]);
    });

    it('should invalidate if beforeDate is not a valid datetime string', () => {
      const data = {
        params: { conversationId: VALID_UUID },
        query: { beforeDate: 'not-a-date' },
      };
      expectInvalid(schema, data, [{ path: ['query', 'beforeDate'], message: 'Invalid datetime' }]);
    });
  });

  // Test searchConversationsSchema
  describe('searchConversationsSchema', () => {
    const schema = ConversationValidation.searchConversationsSchema;

    it('should validate a valid search conversations request', () => {
      const data = { query: { q: 'search term', limit: '5', category: 'work' } };
      expectValid(schema, data);
    });

    it('should invalidate if q is missing', () => {
      const data = { query: {} };
      expectInvalid(schema, data, [{ path: ['query', 'q'], message: 'Search term is required' }]);
    });

    it('should invalidate if q is empty', () => {
      const data = { query: { q: '' } };
      expectInvalid(schema, data, [{ path: ['query', 'q'], message: 'Search term cannot be empty' }]);
    });

    it('should invalidate if limit is not a number string', () => {
      const data = { query: { q: 'term', limit: 'ten' } };
      expectInvalid(schema, data, [{ path: ['query', 'limit'], message: 'Limit must be a number' }]);
    });
  });

  // Test bulkOperationSchema
  describe('bulkOperationSchema', () => {
    const schema = ConversationValidation.bulkOperationSchema;

    it('should validate a valid bulk operation request', () => {
      const data = { body: { conversationIds: [VALID_UUID, ANOTHER_UUID] } };
      expectValid(schema, data);
    });

    it('should invalidate if conversationIds is missing', () => {
      const data = { body: {} };
      expectInvalid(schema, data, [{ path: ['body', 'conversationIds'], message: 'Required' }]);
    });

    it('should invalidate if conversationIds is empty', () => {
      const data = { body: { conversationIds: [] } };
      expectInvalid(schema, data, [{ path: ['body', 'conversationIds'], message: 'At least one conversation ID is required' }]);
    });

    it('should invalidate if an item in conversationIds is not a string', () => {
      const data = { body: { conversationIds: [VALID_UUID, 123] } };
      expectInvalid(schema, data, [{ path: ['body', 'conversationIds', 1], message: 'Expected string, received number' }]);
    });
  });

  // Test addTagsSchema
  describe('addTagsSchema', () => {
    const schema = ConversationValidation.addTagsSchema;

    it('should validate a valid add tags request', () => {
      const data = {
        body: { tags: ['tag1', 'tag2'] },
        params: { conversationId: VALID_UUID },
      };
      expectValid(schema, data);
    });

    it('should invalidate if tags array is empty', () => {
      const data = {
        body: { tags: [] },
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body', 'tags'], message: 'At least one tag is required' }]);
    });

    it('should invalidate if a tag string is empty', () => {
      const data = {
        body: { tags: ['tag1', ''] },
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body', 'tags', 1], message: 'Tag cannot be empty' }]);
    });

    it('should invalidate if conversationId is missing in params', () => {
      const data = {
        body: { tags: ['tag1'] },
        params: {},
      };
      expectInvalid(schema, data, [{ path: ['params', 'conversationId'], message: 'Conversation ID is required' }]);
    });
  });

  // Test getCategoryConversationsSchema
  describe('getCategoryConversationsSchema', () => {
    const schema = ConversationValidation.getCategoryConversationsSchema;

    it('should validate a valid get category conversations request', () => {
      const data = {
        params: { category: 'work' },
        query: { limit: '10', sortBy: 'title', sortOrder: '1' },
      };
      expectValid(schema, data);
    });

    it('should invalidate if category is missing in params', () => {
      const data = {
        params: {},
        query: {},
      };
      expectInvalid(schema, data, [{ path: ['params', 'category'], message: 'Category is required' }]);
    });

    it('should invalidate if limit is not a number string', () => {
      const data = {
        params: { category: 'work' },
        query: { limit: 'five' },
      };
      expectInvalid(schema, data, [{ path: ['query', 'limit'], message: 'Limit must be a number' }]);
    });

    it('should invalidate if sortOrder is invalid', () => {
      const data = {
        params: { category: 'work' },
        query: { sortOrder: '2' },
      };
      expectInvalid(schema, data, [{ path: ['query', 'sortOrder'], message: 'Sort order must be 1 or -1' }]);
    });
  });

  // Test getRecentConversationsSchema
  describe('getRecentConversationsSchema', () => {
    const schema = ConversationValidation.getRecentConversationsSchema;

    it('should validate a valid get recent conversations request', () => {
      const data = { query: { limit: '5' } };
      expectValid(schema, data);
    });

    it('should validate with no query parameters', () => {
      const data = { query: {} };
      expectValid(schema, data);
    });

    it('should invalidate if limit is not a number string', () => {
      const data = { query: { limit: 'abc' } };
      expectInvalid(schema, data, [{ path: ['query', 'limit'], message: 'Limit must be a number' }]);
    });
  });

  // Test shareChatSchema
  describe('shareChatSchema', () => {
    const schema = ConversationValidation.shareChatSchema;

    it('should validate a valid share chat request with default shareType', () => {
      const data = {
        body: {},
        params: { conversationId: VALID_UUID },
      };
      const parsed = expectValid(schema, data);
      expect(parsed.body.shareType).toBe('public'); // Check default value
      expect(parsed.body.allowComments).toBe(false); // Check default value
    });

    it('should validate a valid share chat request with explicit public shareType', () => {
      const data = {
        body: { shareType: 'public', allowComments: true },
        params: { conversationId: VALID_UUID },
      };
      expectValid(schema, data);
    });

    it('should validate a valid share chat request with private shareType and expiresAt', () => {
      const data = {
        body: { shareType: 'private', expiresAt: '2024-12-31T23:59:59.000Z' },
        params: { conversationId: VALID_UUID },
      };
      expectValid(schema, data);
    });

    it('should validate with expiresAt as null', () => {
      const data = {
        body: { expiresAt: null },
        params: { conversationId: VALID_UUID },
      };
      expectValid(schema, data);
    });

    it('should invalidate if conversationId is missing in params', () => {
      const data = {
        body: { shareType: 'public' },
        params: {},
      };
      expectInvalid(schema, data, [{ path: ['params', 'conversationId'], message: 'Conversation ID is required' }]);
    });

    it('should invalidate if shareType is invalid', () => {
      const data = {
        body: { shareType: 'invalid' },
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body', 'shareType'], message: "Invalid enum value. Expected 'public' | 'private', received 'invalid'" }]);
    });

    it('should invalidate if expiresAt is not a valid datetime string', () => {
      const data = {
        body: { expiresAt: 'not-a-date' },
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body', 'expiresAt'], message: 'Invalid datetime' }]);
    });
  });

  // Test updateShareSettingsSchema
  describe('updateShareSettingsSchema', () => {
    const schema = ConversationValidation.updateShareSettingsSchema;

    it('should validate a valid update share settings request with one field', () => {
      const data = {
        body: { shareType: 'private' },
        params: { conversationId: VALID_UUID },
      };
      expectValid(schema, data);
    });

    it('should validate a valid update share settings request with multiple fields', () => {
      const data = {
        body: { expiresAt: '2025-01-01T00:00:00.000Z', allowComments: true, isActive: false },
        params: { conversationId: VALID_UUID },
      };
      expectValid(schema, data);
    });

    it('should validate with expiresAt as null', () => {
      const data = {
        body: { expiresAt: null },
        params: { conversationId: VALID_UUID },
      };
      expectValid(schema, data);
    });

    it('should invalidate if body is empty (no fields provided)', () => {
      const data = {
        body: {},
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body'], message: 'At least one field must be provided' }]);
    });

    it('should invalidate if conversationId is missing in params', () => {
      const data = {
        body: { shareType: 'public' },
        params: {},
      };
      expectInvalid(schema, data, [{ path: ['params', 'conversationId'], message: 'Conversation ID is required' }]);
    });

    it('should invalidate if shareType is invalid', () => {
      const data = {
        body: { shareType: 'invalid' },
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body', 'shareType'], message: "Invalid enum value. Expected 'public' | 'private', received 'invalid'" }]);
    });

    it('should invalidate if expiresAt is not a valid datetime string', () => {
      const data = {
        body: { expiresAt: 'not-a-date' },
        params: { conversationId: VALID_UUID },
      };
      expectInvalid(schema, data, [{ path: ['body', 'expiresAt'], message: 'Invalid datetime' }]);
    });
  });

  // Test getSharedChatSchema
  describe('getSharedChatSchema', () => {
    const schema = ConversationValidation.getSharedChatSchema;

    it('should validate a valid get shared chat request', () => {
      const data = { params: { shareId: VALID_SHARE_UUID } };
      expectValid(schema, data);
    });

    it('should invalidate if shareId is missing in params', () => {
      const data = { params: {} };
      expectInvalid(schema, data, [{ path: ['params', 'shareId'], message: 'Share ID is required' }]);
    });
  });

  // Test getUserSharedChatsSchema
  describe('getUserSharedChatsSchema', () => {
    const schema = ConversationValidation.getUserSharedChatsSchema;

    it('should validate a minimal valid get user shared chats request', () => {
      const data = { query: {} };
      expectValid(schema, data);
    });

    it('should validate a full valid get user shared chats request', () => {
      const data = {
        query: {
          page: '1',
          limit: '10',
          status: 'active',
        },
      };
      expectValid(schema, data);
    });

    it('should invalidate if page is not a number string', () => {
      const data = { query: { page: 'abc' } };
      expectInvalid(schema, data, [{ path: ['query', 'page'], message: 'Page must be a number' }]);
    });

    it('should invalidate if limit is not a number string', () => {
      const data = { query: { limit: 'xyz' } };
      expectInvalid(schema, data, [{ path: ['query', 'limit'], message: 'Limit must be a number' }]);
    });

    it('should invalidate if status is invalid', () => {
      const data = { query: { status: 'pending' } };
      expectInvalid(schema, data, [{ path: ['query', 'status'], message: "Invalid enum value. Expected 'active' | 'expired' | 'revoked', received 'pending'" }]);
    });
  });

});