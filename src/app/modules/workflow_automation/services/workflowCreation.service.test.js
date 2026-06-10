import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workflowCreationService } from './workflowCreation.service.js';
import Workflow from '../models/workflow.model.js';
import WorkflowChatHistory from '../models/workflowChatHistory.model.js';
import {
  processWorkflowRequest,
  continueWorkflowConversation,
} from '../langgraph/workflow.js';
import { logger } from '../../../../shared/logger.js';
import { v4 as uuidv4 } from 'uuid';

// Mock external dependencies
vi.mock('../models/workflow.model.js');
vi.mock('../models/workflowChatHistory.model.js');
vi.mock('../langgraph/workflow.js');
vi.mock('../../../../shared/logger.js');
vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

describe('WorkflowCreationService', () => {
  const userId = 'user123';
  const conversationId = 'conv_abc';
  const userPrompt = 'create a workflow to send daily emails';
  const mockWorkflowId = 'wf_123';

  // Spy on internal methods that are called by other methods within the service
  // This allows us to verify they are called correctly without re-running their full logic
  // which is tested in their own describe blocks.
  let saveChatMessageSpy;
  let createWorkflowSpy;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Default mock implementations for common dependencies
    logger.info.mockImplementation(() => {});
    logger.error.mockImplementation(() => {});
    uuidv4.mockReturnValue('mock-uuid-v4');

    // Mock Workflow model methods
    Workflow.mockClear();
    Workflow.mockImplementation(() => ({
      _id: mockWorkflowId,
      save: vi.fn().mockResolvedValue(this), // 'this' refers to the mocked instance
    }));

    // Mock WorkflowChatHistory model methods
    WorkflowChatHistory.findOne.mockClear();
    WorkflowChatHistory.updateOne.mockClear();
    WorkflowChatHistory.find.mockClear();

    // Spy on internal helper methods
    saveChatMessageSpy = vi.spyOn(workflowCreationService, 'saveChatMessage').mockResolvedValue(undefined);
    createWorkflowSpy = vi.spyOn(workflowCreationService, 'createWorkflow').mockResolvedValue({ _id: mockWorkflowId, name: 'Test Workflow' });
  });

  // Restore spies after all tests in this suite are done
  afterEach(() => {
    saveChatMessageSpy.mockRestore();
    createWorkflowSpy.mockRestore();
  });

  // --- Test createWorkflowFromPrompt ---
  describe('createWorkflowFromPrompt', () => {
    it('should throw an error if processWorkflowRequest fails', async () => {
      processWorkflowRequest.mockResolvedValueOnce({ success: false, error: 'LangGraph error' });

      await expect(workflowCreationService.createWorkflowFromPrompt(userId, userPrompt)).rejects.toThrow('Failed to create workflow: LangGraph error');
      expect(logger.error).toHaveBeenCalledWith('Error creating workflow from prompt:', expect.any(Error));
      expect(processWorkflowRequest).toHaveBeenCalledWith(userPrompt, userId, null);
      expect(saveChatMessageSpy).not.toHaveBeenCalled(); // Should not save if processing fails early
    });

    it('should return a plan and needsConfirmation true if LangGraph requests confirmation', async () => {
      const mockLangGraphResult = {
        success: true,
        conversationId: conversationId,
        result: {
          response: 'Please confirm the workflow plan.',
          responseType: 'confirmation',
          needsConfirmation: true,
          userIntent: 'Send daily emails',
          taskType: 'email',
          complexity: 'medium',
          detectedApps: ['Gmail'],
          workflowSteps: [{ step: 1, action: 'send email' }],
          scheduleRequired: true,
          scheduleConfig: { frequency: 'daily' },
          triggerType: 'scheduled',
          extractedParameters: { recipient: 'test@example.com' },
        },
      };
      processWorkflowRequest.mockResolvedValueOnce(mockLangGraphResult);

      WorkflowChatHistory.updateOne.mockResolvedValueOnce({ acknowledged: true, modifiedCount: 1, upsertedId: null });

      const result = await workflowCreationService.createWorkflowFromPrompt(userId, userPrompt);

      expect(result).toEqual({
        success: true,
        needsConfirmation: true,
        message: mockLangGraphResult.result.response,
        conversationId: conversationId,
        workflowPlan: {
          userIntent: 'Send daily emails',
          taskType: 'email',
          complexity: 'medium',
          detectedApps: ['Gmail'],
          workflowSteps: [{ step: 1, action: 'send email' }],
          scheduleRequired: true,
          scheduleConfig: { frequency: 'daily' },
          triggerType: 'scheduled',
          extractedParameters: { recipient: 'test@example.com' },
        },
      });
      expect(processWorkflowRequest).toHaveBeenCalledWith(userPrompt, userId, null);
      expect(saveChatMessageSpy).toHaveBeenCalledTimes(2);
      expect(saveChatMessageSpy).toHaveBeenCalledWith(conversationId, userId, 'user', userPrompt);
      expect(saveChatMessageSpy).toHaveBeenCalledWith(conversationId, userId, 'assistant', mockLangGraphResult.result.response);
      expect(WorkflowChatHistory.updateOne).toHaveBeenCalledWith(
        { conversationId, userId },
        {
          $set: {
            'context.workflowPlan': expect.any(Object),
            status: 'pending_confirmation',
          },
        },
        { upsert: true }
      );
      expect(createWorkflowSpy).not.toHaveBeenCalled();
    });

    it('should create a workflow if LangGraph returns success and no confirmation is needed', async () => {
      const mockLangGraphResult = {
        success: true,
        conversationId: conversationId,
        result: {
          response: 'Workflow created successfully!',
          responseType: 'success',
          needsConfirmation: false,
          userIntent: 'Send daily emails',
          taskType: 'email',
          complexity: 'medium',
          detectedApps: ['Gmail'],
          workflowSteps: [{ step: 1, action: 'send email' }],
          scheduleRequired: true,
          scheduleConfig: { frequency: 'daily' },
          triggerType: 'scheduled',
          extractedParameters: { recipient: 'test@example.com' },
        },
      };
      processWorkflowRequest.mockResolvedValueOnce(mockLangGraphResult);
      createWorkflowSpy.mockResolvedValueOnce({ _id: mockWorkflowId, name: 'Send daily emails' }); // Specific mock for this test

      const result = await workflowCreationService.createWorkflowFromPrompt(userId, userPrompt);

      expect(result).toEqual({
        success: true,
        needsConfirmation: false,
        message: mockLangGraphResult.result.response,
        workflowId: mockWorkflowId,
        workflow: { _id: mockWorkflowId, name: 'Send daily emails' },
        conversationId: conversationId,
      });
      expect(processWorkflowRequest).toHaveBeenCalledWith(userPrompt, userId, null);
      expect(saveChatMessageSpy).toHaveBeenCalledTimes(2);
      expect(createWorkflowSpy).toHaveBeenCalledWith({
        userId,
        name: 'Send daily emails',
        description: `Automated workflow created from: "${userPrompt}"`,
        originalPrompt: userPrompt,
        steps: [{ step: 1, action: 'send email' }],
        trigger: {
          triggerType: 'scheduled',
          scheduleConfig: { frequency: 'daily' },
        },
        category: 'email',
        requiredApps: [{ app: 'Gmail', connected: false }],
        metadata: {
          conversationId: conversationId,
          complexity: 'medium',
          createdViaChat: true,
        },
      });
      expect(WorkflowChatHistory.updateOne).not.toHaveBeenCalled(); // No plan to save if directly created
    });

    it('should handle other response types from LangGraph without creating a workflow or needing confirmation', async () => {
      const mockLangGraphResult = {
        success: true,
        conversationId: conversationId,
        result: {
          response: 'I need more information.',
          responseType: 'info',
          needsConfirmation: false,
          workflowSteps: [], // No steps to create a workflow
        },
      };
      processWorkflowRequest.mockResolvedValueOnce(mockLangGraphResult);

      const result = await workflowCreationService.createWorkflowFromPrompt(userId, userPrompt);

      expect(result).toEqual({
        success: true,
        needsConfirmation: false,
        message: mockLangGraphResult.result.response,
        conversationId: conversationId,
      });
      expect(processWorkflowRequest).toHaveBeenCalledWith(userPrompt, userId, null);
      expect(saveChatMessageSpy).toHaveBeenCalledTimes(2);
      expect(createWorkflowSpy).not.toHaveBeenCalled();
      expect(WorkflowChatHistory.updateOne).not.toHaveBeenCalled();
    });

    it('should use provided conversationId if available', async () => {
      const existingConversationId = 'conv_existing';
      const mockLangGraphResult = {
        success: true,
        conversationId: existingConversationId,
        result: {
          response: 'Workflow created successfully!',
          responseType: 'success',
          needsConfirmation: false,
          userIntent: 'Send daily emails',
          taskType: 'email',
          complexity: 'medium',
          detectedApps: ['Gmail'],
          workflowSteps: [{ step: 1, action: 'send email' }],
          scheduleRequired: true,
          scheduleConfig: { frequency: 'daily' },
          triggerType: 'scheduled',
          extractedParameters: { recipient: 'test@example.com' },
        },
      };
      processWorkflowRequest.mockResolvedValueOnce(mockLangGraphResult);
      createWorkflowSpy.mockResolvedValueOnce({ _id: mockWorkflowId, name: 'Send daily emails' });

      await workflowCreationService.createWorkflowFromPrompt(userId, userPrompt, existingConversationId);

      expect(processWorkflowRequest).toHaveBeenCalledWith(userPrompt, userId, existingConversationId);
      expect(saveChatMessageSpy).toHaveBeenCalledWith(existingConversationId, userId, 'user', userPrompt);
    });
  });

  // --- Test confirmWorkflowCreation ---
  describe('confirmWorkflowCreation', () => {
    it('should cancel workflow creation if not approved', async () => {
      WorkflowChatHistory.updateOne.mockResolvedValueOnce({ acknowledged: true, modifiedCount: 1 });

      const result = await workflowCreationService.confirmWorkflowCreation(userId, conversationId, false);

      expect(result).toEqual({
        success: true,
        message: 'Workflow creation cancelled.',
        conversationId,
      });
      expect(saveChatMessageSpy).toHaveBeenCalledTimes(2);
      expect(saveChatMessageSpy).toHaveBeenCalledWith(conversationId, userId, 'user', 'No, cancel the workflow');
      expect(saveChatMessageSpy).toHaveBeenCalledWith(conversationId, userId, 'assistant', "Workflow creation cancelled. Feel free to describe a different automation you'd like to create!");
      expect(WorkflowChatHistory.updateOne).toHaveBeenCalledWith(
        { conversationId, userId },
        { $set: { status: 'cancelled' } }
      );
      expect(createWorkflowSpy).not.toHaveBeenCalled();
    });

    it('should throw an error if conversation is not found or not owned by user', async () => {
      WorkflowChatHistory.findOne.mockReturnValueOnce({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValueOnce(null)
      });

      await expect(workflowCreationService.confirmWorkflowCreation(userId, conversationId, true)).rejects.toThrow('Conversation not found or not owned by user');
      expect(WorkflowChatHistory.findOne).toHaveBeenCalledWith({ conversationId, userId });
      expect(logger.error).toHaveBeenCalledWith('Error confirming workflow creation:', expect.any(Error));
    });

    it('should throw an error if workflow plan is not found in conversation context', async () => {
      WorkflowChatHistory.findOne.mockReturnValueOnce({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValueOnce({
          conversationId,
          userId,
          messages: [],
          context: {}, // No workflowPlan
        })
      });

      await expect(workflowCreationService.confirmWorkflowCreation(userId, conversationId, true)).rejects.toThrow('Workflow plan not found in conversation');
      expect(WorkflowChatHistory.findOne).toHaveBeenCalledWith({ conversationId, userId });
      expect(logger.error).toHaveBeenCalledWith('Error confirming workflow creation:', expect.any(Error));
    });

    it('should create workflow successfully without modifications', async () => {
      const mockWorkflowPlan = {
        userIntent: 'Send daily emails',
        taskType: 'email',
        complexity: 'medium',
        detectedApps: ['Gmail'],
        workflowSteps: [{ step: 1, action: 'send email' }],
        scheduleRequired: true,
        scheduleConfig: { frequency: 'daily' },
        triggerType: 'scheduled',
        extractedParameters: { recipient: 'test@example.com' },
      };
      const mockChatHistory = {
        conversationId,
        userId,
        messages: [{ role: 'user', content: userPrompt }],
        context: { workflowPlan: mockWorkflowPlan },
      };

      WorkflowChatHistory.findOne.mockReturnValueOnce({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValueOnce(mockChatHistory)
      });
      createWorkflowSpy.mockResolvedValueOnce({ _id: mockWorkflowId, name: 'Send daily emails' }); // Specific mock for this test
      WorkflowChatHistory.updateOne.mockResolvedValueOnce({ acknowledged: true, modifiedCount: 1 });

      const result = await workflowCreationService.confirmWorkflowCreation(userId, conversationId, true);

      expect(result).toEqual({
        success: true,
        message: `Workflow "Send daily emails" created successfully!`,
        workflowId: mockWorkflowId,
        workflow: { _id: mockWorkflowId, name: 'Send daily emails' },
        conversationId,
      });
      expect(WorkflowChatHistory.findOne).toHaveBeenCalledWith({ conversationId, userId });
      expect(createWorkflowSpy).toHaveBeenCalledWith({
        userId,
        name: 'Send daily emails',
        description: 'Automated workflow created from chat conversation',
        originalPrompt: userPrompt,
        steps: [{ step: 1, action: 'send email' }],
        trigger: {
          triggerType: 'scheduled',
          scheduleConfig: { frequency: 'daily' },
        },
        category: 'email',
        requiredApps: [{ app: 'Gmail', connected: false }],
        metadata: {
          conversationId,
          complexity: 'medium',
          createdViaChat: true,
        },
      });
      expect(saveChatMessageSpy).toHaveBeenCalledTimes(2);
      expect(saveChatMessageSpy).toHaveBeenCalledWith(conversationId, userId, 'user', 'Yes, create the workflow');
      expect(saveChatMessageSpy).toHaveBeenCalledWith(conversationId, userId, 'assistant', `Perfect! I've created your workflow "Send daily emails". It's now ready to use. Workflow ID: ${mockWorkflowId}`);
      expect(WorkflowChatHistory.updateOne).toHaveBeenCalledWith(
        { conversationId, userId },
        {
          $push: { workflowIds: mockWorkflowId },
          $set: { status: 'completed' },
        }
      );
    });

    it('should create workflow successfully with modifications', async () => {
      const mockWorkflowPlan = {
        userIntent: 'Send daily emails',
        taskType: 'email',
        complexity: 'medium',
        detectedApps: ['Gmail'],
        workflowSteps: [{ step: 1, action: 'send email' }],
        scheduleRequired: true,
        scheduleConfig: { frequency: 'daily' },
        triggerType: 'scheduled',
        extractedParameters: { recipient: 'test@example.com' },
      };
      const mockChatHistory = {
        conversationId,
        userId,
        messages: [{ role: 'user', content: userPrompt }],
        context: { workflowPlan: mockWorkflowPlan },
      };
      const modifications = {
        name: 'Modified Workflow Name',
        workflowSteps: [{ step: 1, action: 'send modified email' }],
        scheduleRequired: false,
        scheduleConfig: null,
      };

      WorkflowChatHistory.findOne.mockReturnValueOnce({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValueOnce(mockChatHistory)
      });
      createWorkflowSpy.mockResolvedValueOnce({ _id: mockWorkflowId, name: modifications.name }); // Specific mock for this test
      WorkflowChatHistory.updateOne.mockResolvedValueOnce({ acknowledged: true, modifiedCount: 1 });

      const result = await workflowCreationService.confirmWorkflowCreation(userId, conversationId, true, modifications);

      expect(result.workflow.name).toBe(modifications.name);
      expect(createWorkflowSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: modifications.name,
          steps: modifications.workflowSteps,
          trigger: {
            triggerType: mockWorkflowPlan.triggerType, // Trigger type not modified
            scheduleConfig: modifications.scheduleConfig, // Schedule config modified
          },
        })
      );
    });
  });

  // --- Test continueConversation ---
  describe('continueConversation', () => {
    const userInput = 'What else can it do?';
    const mockAssistantResponse = 'I can help with many things!';
    const mockLangGraphResult = {
      success: true,
      result: {
        response: mockAssistantResponse,
        responseType: 'info',
        state: { some: 'state' },
      },
    };

    it('should throw an error if continueWorkflowConversation fails', async () => {
      continueWorkflowConversation.mockResolvedValueOnce({ success: false, error: 'LangGraph conversation error' });

      await expect(workflowCreationService.continueConversation(userId, conversationId, userInput)).rejects.toThrow('Failed to continue conversation: LangGraph conversation error');
      expect(logger.error).toHaveBeenCalledWith('Error continuing conversation:', expect.any(Error));
      expect(continueWorkflowConversation).toHaveBeenCalledWith(userInput, conversationId, userId);
      expect(saveChatMessageSpy).not.toHaveBeenCalled();
    });

    it('should successfully continue conversation and save messages', async () => {
      continueWorkflowConversation.mockResolvedValueOnce(mockLangGraphResult);

      const result = await workflowCreationService.continueConversation(userId, conversationId, userInput);

      expect(result).toEqual({
        success: true,
        message: mockAssistantResponse,
        responseType: 'info',
        conversationId,
        state: mockLangGraphResult.result.state,
      });
      expect(continueWorkflowConversation).toHaveBeenCalledWith(userInput, conversationId, userId);
      expect(saveChatMessageSpy).toHaveBeenCalledTimes(2);
      expect(saveChatMessageSpy).toHaveBeenCalledWith(conversationId, userId, 'user', userInput);
      expect(saveChatMessageSpy).toHaveBeenCalledWith(conversationId, userId, 'assistant', mockAssistantResponse);
    });
  });

  // --- Test createWorkflow (actual implementation, not spy) ---
  describe('createWorkflow', () => {
    // Restore the original implementation for this block to test the actual method
    beforeEach(() => {
      createWorkflowSpy.mockRestore();
    });

    const workflowData = {
      userId,
      name: 'Test Workflow',
      description: 'A test workflow',
      originalPrompt: 'create a test workflow',
      steps: [{ name: 'step1' }],
      trigger: { triggerType: 'manual' },
      category: 'other',
      requiredApps: [],
      metadata: {},
    };

    it('should successfully create and save a workflow', async () => {
      const mockWorkflowInstance = {
        _id: mockWorkflowId,
        ...workflowData,
        save: vi.fn().mockResolvedValue(this),
      };
      Workflow.mockImplementationOnce(() => mockWorkflowInstance);

      const createdWorkflow = await workflowCreationService.createWorkflow(workflowData);

      expect(Workflow).toHaveBeenCalledWith(workflowData);
      expect(mockWorkflowInstance.save).toHaveBeenCalledTimes(1);
      expect(createdWorkflow).toEqual(mockWorkflowInstance);
      expect(logger.info).toHaveBeenCalledWith(`Workflow created: ${mockWorkflowId}`);
    });

    it('should throw an error if workflow save fails', async () => {
      const saveError = new Error('DB save failed');
      Workflow.mockImplementationOnce(() => ({
        _id: mockWorkflowId,
        save: vi.fn().mockRejectedValue(saveError),
      }));

      await expect(workflowCreationService.createWorkflow(workflowData)).rejects.toThrow('Failed to save workflow: DB save failed');
      expect(logger.error).toHaveBeenCalledWith('Error creating workflow in database:', saveError);
    });
  });

  // --- Test saveChatMessage (actual implementation, not spy) ---
  describe('saveChatMessage', () => {
    // Restore the original implementation for this block to test the actual method
    beforeEach(() => {
      saveChatMessageSpy.mockRestore();
    });

    it('should save a user message and set title on first message', async () => {
      const userMessage = 'Hello, create a new workflow for me.';
      WorkflowChatHistory.updateOne.mockResolvedValueOnce({ acknowledged: true, upserted: true });

      await workflowCreationService.saveChatMessage(conversationId, userId, 'user', userMessage);

      expect(WorkflowChatHistory.updateOne).toHaveBeenCalledWith(
        { conversationId, userId },
        {
          $push: { messages: expect.objectContaining({ role: 'user', content: userMessage }) },
          $set: { userId, lastActivity: expect.any(Date) },
          $setOnInsert: { title: userMessage.substring(0, 50) },
        },
        { upsert: true }
      );
    });

    it('should save an assistant message without setting title', async () => {
      const assistantMessage = 'Sure, I can help with that.';
      WorkflowChatHistory.updateOne.mockResolvedValueOnce({ acknowledged: true, modifiedCount: 1 });

      await workflowCreationService.saveChatMessage(conversationId, userId, 'assistant', assistantMessage);

      expect(WorkflowChatHistory.updateOne).toHaveBeenCalledWith(
        { conversationId, userId },
        {
          $push: { messages: expect.objectContaining({ role: 'assistant', content: assistantMessage }) },
          $set: { userId, lastActivity: expect.any(Date) },
        },
        { upsert: true }
      );
      expect(WorkflowChatHistory.updateOne.mock.calls[0][1]).not.toHaveProperty('$setOnInsert');
    });

    it('should save a message with explicit title metadata', async () => {
      const userMessage = 'New conversation title';
      const metadata = { title: 'Custom Title' };
      WorkflowChatHistory.updateOne.mockResolvedValueOnce({ acknowledged: true, upserted: true });

      await workflowCreationService.saveChatMessage(conversationId, userId, 'user', userMessage, metadata);

      expect(WorkflowChatHistory.updateOne).toHaveBeenCalledWith(
        { conversationId, userId },
        {
          $push: { messages: expect.objectContaining({ role: 'user', content: userMessage, metadata }) },
          $set: { userId, lastActivity: expect.any(Date), title: 'Custom Title' },
        },
        { upsert: true }
      );
      expect(WorkflowChatHistory.updateOne.mock.calls[0][1]).not.toHaveProperty('$setOnInsert'); // $setOnInsert should not be used if $set.title is present
    });

    it('should throw an error if saving chat message fails', async () => {
      const saveError = new Error('DB update failed');
      WorkflowChatHistory.updateOne.mockRejectedValueOnce(saveError);

      await expect(workflowCreationService.saveChatMessage(conversationId, userId, 'user', 'test')).rejects.toThrow('Failed to save chat message: DB update failed');
      expect(logger.error).toHaveBeenCalledWith('Error saving chat message:', saveError);
    });
  });

  // --- Test getUserConversations ---
  describe('getUserConversations', () => {
    const mockConversations = [
      { conversationId: 'conv_1', userId, lastActivity: new Date(), workflowIds: [{ _id: 'wf_a', name: 'WF A', status: 'active' }] },
      { conversationId: 'conv_2', userId, lastActivity: new Date(), workflowIds: [] },
    ];

    beforeEach(() => {
      WorkflowChatHistory.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockConversations),
      });
    });

    it('should retrieve user conversations with default limit and offset', async () => {
      const conversations = await workflowCreationService.getUserConversations(userId);

      expect(WorkflowChatHistory.find).toHaveBeenCalledWith({ userId });
      expect(WorkflowChatHistory.find().sort).toHaveBeenCalledWith({ lastActivity: -1 });
      expect(WorkflowChatHistory.find().limit).toHaveBeenCalledWith(50);
      expect(WorkflowChatHistory.find().skip).toHaveBeenCalledWith(0);
      expect(WorkflowChatHistory.find().populate).toHaveBeenCalledWith('workflowIds', 'name status');
      expect(WorkflowChatHistory.find().lean).toHaveBeenCalled();
      expect(conversations).toEqual(mockConversations);
    });

    it('should retrieve user conversations with custom limit and offset', async () => {
      const limit = 10;
      const offset = 5;
      await workflowCreationService.getUserConversations(userId, limit, offset);

      expect(WorkflowChatHistory.find().limit).toHaveBeenCalledWith(limit);
      expect(WorkflowChatHistory.find().skip).toHaveBeenCalledWith(offset);
    });

    it('should return an empty array if no conversations are found', async () => {
      WorkflowChatHistory.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      });

      const conversations = await workflowCreationService.getUserConversations(userId);
      expect(conversations).toEqual([]);
    });

    it('should throw an error if retrieving conversations fails', async () => {
      const findError = new Error('DB find failed');
      WorkflowChatHistory.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(findError),
      });

      await expect(workflowCreationService.getUserConversations(userId)).rejects.toThrow('Failed to get conversations: DB find failed');
      expect(logger.error).toHaveBeenCalledWith('Error getting user conversations:', findError);
    });
  });

  // --- Test getConversation ---
  describe('getConversation', () => {
    const mockConversation = {
      conversationId,
      userId,
      messages: [{ role: 'user', content: 'hi' }],
      workflowIds: [{ _id: 'wf_a', name: 'WF A' }],
    };

    beforeEach(() => {
      WorkflowChatHistory.findOne.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockConversation),
      });
    });

    it('should retrieve a specific conversation for a user', async () => {
      const conversation = await workflowCreationService.getConversation(conversationId, userId);

      expect(WorkflowChatHistory.findOne).toHaveBeenCalledWith({ conversationId, userId });
      expect(WorkflowChatHistory.findOne().populate).toHaveBeenCalledWith('workflowIds');
      expect(WorkflowChatHistory.findOne().lean).toHaveBeenCalled();
      expect(conversation).toEqual(mockConversation);
    });

    it('should return null if conversation is not found', async () => {
      WorkflowChatHistory.findOne.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      });

      const conversation = await workflowCreationService.getConversation(conversationId, userId);
      expect(conversation).toBeNull();
    });

    it('should throw an error if retrieving conversation fails', async () => {
      const findError = new Error('DB findOne failed');
      WorkflowChatHistory.findOne.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(findError),
      });

      await expect(workflowCreationService.getConversation(conversationId, userId)).rejects.toThrow('Failed to get conversation: DB findOne failed');
      expect(logger.error).toHaveBeenCalledWith('Error getting conversation:', findError);
    });
  });

  // --- Test mapTaskTypeToCategory ---
  describe('mapTaskTypeToCategory', () => {
    it('should map known task types to their categories', () => {
      expect(workflowCreationService.mapTaskTypeToCategory('email')).toBe('email');
      expect(workflowCreationService.mapTaskTypeToCategory('social')).toBe('social');
      expect(workflowCreationService.mapTaskTypeToCategory('productivity')).toBe('productivity');
      expect(workflowCreationService.mapTaskTypeToCategory('finance')).toBe('finance');
      expect(workflowCreationService.mapTaskTypeToCategory('communication')).toBe('communication');
      expect(workflowCreationService.mapTaskTypeToCategory('notification')).toBe('communication');
      expect(workflowCreationService.mapTaskTypeToCategory('scheduling')).toBe('productivity');
      expect(workflowCreationService.mapTaskTypeToCategory('data_processing')).toBe('productivity');
    });

    it('should return "other" for unknown task types', () => {
      expect(workflowCreationService.mapTaskTypeToCategory('unknown_type')).toBe('other');
      expect(workflowCreationService.mapTaskTypeToCategory('random')).toBe('other');
      expect(workflowCreationService.mapTaskTypeToCategory(null)).toBe('other');
      expect(workflowCreationService.mapTaskTypeToCategory(undefined)).toBe('other');
      expect(workflowCreationService.mapTaskTypeToCategory('')).toBe('other');
    });
  });

  // --- Test generateConversationId ---
  describe('generateConversationId', () => {
    it('should generate a unique conversation ID with "conv_" prefix', () => {
      uuidv4.mockReturnValueOnce('1234-abcd');
      const id = workflowCreationService.generateConversationId();
      expect(id).toBe('conv_1234-abcd');
      expect(uuidv4).toHaveBeenCalledTimes(1);
    });
  });
});