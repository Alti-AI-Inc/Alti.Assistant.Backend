import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { workflowResilienceService } from './workflowResilience.service.js';

// --- Mock Dependencies ---

// Mock Google Cloud Pub/Sub
const mockPublishMessage = vi.fn();

const {
  mockTopic,
  mockCreateTask,
  mockQueuePath,
  mockPipeline
} = vi.hoisted(() => {
  const mockTopic = vi.fn().mockImplementation(() => ({
    publishMessage: mockPublishMessage,
  }));

  // Mock Google Cloud Tasks
  const mockCreateTask = vi.fn();
  const mockQueuePath = vi.fn().mockImplementation(
    (project, location, queue) => `projects/${project}/locations/${location}/queues/${queue}`
  );

  // Mock Redis
  const mockPipeline = {
    rpush: vi.fn(),
    expire: vi.fn(),
    exec: vi.fn().mockResolvedValue([]),
  };

  return {
    mockTopic,
    mockCreateTask,
    mockQueuePath,
    mockPipeline
  };
});

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: vi.fn().mockImplementation(() => ({
    topic: mockTopic,
  })),
}));

vi.mock('@google-cloud/tasks', () => ({
  CloudTasksClient: vi.fn().mockImplementation(() => ({
    queuePath: mockQueuePath,
    createTask: mockCreateTask,
  })),
}));

// Mock Logger
vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../shared/redis.js', () => ({
  RedisClient: {
    pipeline: vi.fn().mockImplementation(() => mockPipeline),
    lrange: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
  },
}));
// Re-import the service to use the mocked dependencies
const { RedisClient } = await import('../../../../shared/redis.js');
const { CloudTasksClient } = await import('@google-cloud/tasks');
const cloudTasksClient = new CloudTasksClient();


describe('WorkflowResilienceService', () => {
  const stepDetails = {
    executionId: 'exec-123',
    stepId: 'step-abc',
    app: 'gmail',
    action: 'send_email',
    parameters: { to: 'test@example.com', subject: 'Hello' },
  };

  beforeEach(() => {
    // Spy on the internal execution method to control its behavior
    vi.spyOn(workflowResilienceService, '_executeComposioAction').mockResolvedValue({ data: 'success' });
    vi.spyOn(workflowResilienceService, '_scheduleWorkflowStepTask').mockResolvedValue({ name: 'task-123' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleWorkflowStep', () => {
    it('should execute a step successfully on the first attempt', async () => {
      RedisClient.eval.mockResolvedValue([1, 0]); // Rate limit check passes

      const result = await workflowResilienceService.handleWorkflowStep(stepDetails);

      expect(result.status).toBe('SUCCESS');
      expect(result.result).toEqual({ data: 'success' });
      expect(result.attempts).toBe(1);
      expect(workflowResilienceService._executeComposioAction).toHaveBeenCalledWith('gmail', 'send_email', stepDetails.parameters);
      expect(workflowResilienceService._scheduleWorkflowStepTask).not.toHaveBeenCalled();
    });

    it('should return FAILED after max attempts with a non-retryable error', async () => {
      const nonRetryableError = new Error('Invalid API Key');
      workflowResilienceService._executeComposioAction.mockRejectedValue(nonRetryableError);
      RedisClient.eval.mockResolvedValue([1, 0]);

      const result = await workflowResilienceService.handleWorkflowStep(stepDetails);

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Invalid API Key');
      expect(result.attempts).toBe(1);
      expect(workflowResilienceService._scheduleWorkflowStepTask).not.toHaveBeenCalled();
    });

    it('should schedule a retry for a retryable error', async () => {
      const retryableError = new Error('503 Service Unavailable');
      workflowResilienceService._executeComposioAction.mockRejectedValue(retryableError);
      RedisClient.eval.mockResolvedValue([1, 0]);

      const result = await workflowResilienceService.handleWorkflowStep(stepDetails, { currentAttempt: 1 });

      expect(result.status).toBe('RETRY_SCHEDULED');
      expect(result.scheduled).toBe(true);
      expect(result.nextAttempt).toBe(2);
      expect(workflowResilienceService._scheduleWorkflowStepTask).toHaveBeenCalledOnce();
      const [taskDetails, taskOptions, delay] = workflowResilienceService._scheduleWorkflowStepTask.mock.calls[0];
      expect(taskDetails).toEqual(stepDetails);
      expect(taskOptions.currentAttempt).toBe(2);
      expect(delay).toBeGreaterThan(0);
    });

    it('should return FAILED if the last retry attempt fails', async () => {
      const retryableError = new Error('ETIMEDOUT');
      workflowResilienceService._executeComposioAction.mockRejectedValue(retryableError);
      RedisClient.eval.mockResolvedValue([1, 0]);

      const options = { currentAttempt: 3, actionType: 'network' }; // maxAttempts is 3 for network
      const result = await workflowResilienceService.handleWorkflowStep(stepDetails, options);

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('ETIMEDOUT');
      expect(result.attempts).toBe(3);
      expect(workflowResilienceService._scheduleWorkflowStepTask).not.toHaveBeenCalled();
    });

    it('should handle rate limiting by scheduling a throttled task', async () => {
      RedisClient.eval.mockResolvedValue([0, 5000]); // Rate limit check fails, wait 5000ms

      const result = await workflowResilienceService.handleWorkflowStep(stepDetails);

      expect(result.status).toBe('THROTTLED');
      expect(result.scheduled).toBe(true);
      expect(result.waitTimeMs).toBe(5000);
      expect(workflowResilienceService._executeComposioAction).not.toHaveBeenCalled();
      expect(workflowResilienceService._scheduleWorkflowStepTask).toHaveBeenCalledOnce();
      const [taskDetails, taskOptions, delay] = workflowResilienceService._scheduleWorkflowStepTask.mock.calls[0];
      expect(taskDetails).toEqual(stepDetails);
      expect(delay).toBe(5); // 5000ms -> 5s
    });
  });

  describe('registerCompletedStep', () => {
    it('should add the completed step to Redis with a TTL', async () => {
      const step = { stepId: 's1', app: 'slack', action: 'send_message', parameters: {} };
      const stepResult = { data: { ts: '12345.6789' } };

      await workflowResilienceService.registerCompletedStep('exec-123', step, stepResult);

      expect(RedisClient.pipeline).toHaveBeenCalledOnce();
      expect(mockPipeline.rpush).toHaveBeenCalledWith('completed_steps:exec-123', expect.any(String));
      const savedData = JSON.parse(mockPipeline.rpush.mock.calls[0][1]);
      expect(savedData.stepId).toBe('s1');
      expect(savedData.rollbackAction).toBe('delete_message');
      expect(savedData.result).toEqual(stepResult);
      expect(mockPipeline.expire).toHaveBeenCalledWith('completed_steps:exec-123', 86400);
      expect(mockPipeline.exec).toHaveBeenCalledOnce();
    });
  });

  describe('rollbackExecution', () => {
    it('should publish rollback messages for reversible steps and then cleanup', async () => {
      const completedSteps = [
        { stepId: 's1', app: 'gmail', action: 'create_draft', result: { data: { id: 'draft-1' } }, rollbackAction: 'delete_draft' },
        { stepId: 's2', app: 'slack', action: 'send_message', result: { data: { channelId: 'C1', ts: '123' } }, rollbackAction: 'delete_message' },
        { stepId: 's3', app: 'notion', action: 'update_page', result: { data: { id: 'page-1' } }, rollbackAction: null }, // Not reversible
      ];
      RedisClient.lrange.mockResolvedValue(completedSteps.map(s => JSON.stringify(s)));
      mockPublishMessage.mockResolvedValue('message-id');

      const result = await workflowResilienceService.rollbackExecution('exec-123');

      expect(RedisClient.lrange).toHaveBeenCalledWith('completed_steps:exec-123', 0, -1);
      expect(mockPublishMessage).toHaveBeenCalledTimes(2);

      // Check payload for slack rollback (it's published in reverse order)
      const slackPayload = JSON.parse(mockPublishMessage.mock.calls[0][0].data.toString());
      expect(slackPayload.taskType).toBe('WORKFLOW_STEP_ROLLBACK');
      expect(slackPayload.stepToRollback.stepId).toBe('s2');
      expect(slackPayload.stepToRollback.rollbackParameters).toEqual({ channelId: 'C1', ts: '123' });

      // Check payload for gmail rollback
      const gmailPayload = JSON.parse(mockPublishMessage.mock.calls[1][0].data.toString());
      expect(gmailPayload.stepToRollback.stepId).toBe('s1');
      expect(gmailPayload.stepToRollback.rollbackParameters).toEqual({ id: 'draft-1' });

      expect(RedisClient.del).toHaveBeenCalledWith('completed_steps:exec-123');
      expect(result).toEqual({
        status: 'INITIATED',
        message: 'Published 2 rollback messages.',
        publishedMessages: 2,
        totalSteps: 3,
      });
    });

    it('should return NO_OP if no steps are found in Redis', async () => {
      RedisClient.lrange.mockResolvedValue([]);

      const result = await workflowResilienceService.rollbackExecution('exec-404');

      expect(mockPublishMessage).not.toHaveBeenCalled();
      expect(RedisClient.del).not.toHaveBeenCalled(); // Cleanup is not called if no steps
      expect(result).toEqual({
        status: 'NO_OP',
        message: 'No steps to rollback',
        publishedMessages: 0,
      });
    });
  });

  describe('cleanup', () => {
    it('should delete the correct key from Redis', async () => {
      await workflowResilienceService.cleanup('exec-to-clean');
      expect(RedisClient.del).toHaveBeenCalledWith('completed_steps:exec-to-clean');
    });
  });

  describe('_scheduleWorkflowStepTask', () => {
    // Un-spy the method to test its real implementation
    beforeEach(() => {
      workflowResilienceService._scheduleWorkflowStepTask.mockRestore();
    });

    it('should create a Cloud Task with the correct payload and no delay', async () => {
      mockCreateTask.mockResolvedValue([{ name: 'task-name' }]);
      const options = { currentAttempt: 2 };

      await workflowResilienceService._scheduleWorkflowStepTask(stepDetails, options, 0);

      expect(cloudTasksClient.createTask).toHaveBeenCalledOnce();
      const [request] = mockCreateTask.mock.calls[0];
      expect(request.parent).toContain('workflow-execution-queue');
      expect(request.task.httpRequest.httpMethod).toBe('POST');
      expect(request.task.httpRequest.url).toBe(process.env.GCP_TASK_HANDLER_URL || 'https://your-backend-service.com/internal/v1/tasks/handle-workflow-step');
      expect(request.task.scheduleTime).toBeUndefined();

      const body = JSON.parse(Buffer.from(request.task.httpRequest.body, 'base64').toString());
      expect(body.taskType).toBe('WORKFLOW_STEP_EXECUTION');
      expect(body.stepDetails).toEqual(stepDetails);
      expect(body.options).toEqual(options);
    });

    it('should create a Cloud Task with a scheduled time if delay is provided', async () => {
      mockCreateTask.mockResolvedValue([{ name: 'task-name' }]);
      const nowSeconds = Math.floor(Date.now() / 1000);
      vi.spyOn(Date, 'now').mockReturnValue(nowSeconds * 1000);

      await workflowResilienceService._scheduleWorkflowStepTask(stepDetails, {}, 60);

      expect(cloudTasksClient.createTask).toHaveBeenCalledOnce();
      const [request] = mockCreateTask.mock.calls[0];
      expect(request.task.scheduleTime.seconds).toBe(nowSeconds + 60);
    });
  });
});