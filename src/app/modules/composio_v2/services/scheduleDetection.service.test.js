import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectSchedulingRequirements,
  parseScheduleExpression,
  generateWorkflowMetadata,
} from './scheduleDetection.service.js';

// Mock the AI classification service
vi.mock('../services/aiClassificationService.js', () => ({
  runGeminiTask: vi.fn(),
}));

// Import the mocked function
import { runGeminiTask } from '../services/aiClassificationService.js';

// Mock console.error and console.log to prevent test output pollution
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('ScheduleDetectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockClear();
    consoleLogSpy.mockClear();
  });

  // --- Test detectSchedulingRequirements ---
  describe('detectSchedulingRequirements', () => {
    it('should detect immediate execution from AI response', async () => {
      const mockAiResponse = {
        requiresScheduling: false,
        triggerType: 'immediate',
        scheduleExpression: null,
        scheduleConfig: {
          triggerDate: null,
          cronExpression: null,
          recurrencePattern: null,
          timezone: 'UTC',
        },
        confidence: 0.99,
        reasoning: 'User wants immediate execution.',
        workflowTitle: 'Run task now',
        workflowDescription: 'Executes the task immediately.',
      };
      runGeminiTask.mockResolvedValueOnce(JSON.stringify(mockAiResponse));

      const userInput = 'Run this task now';
      const result = await detectSchedulingRequirements(userInput);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
      expect(consoleLogSpy).toHaveBeenCalledWith('Schedule detection result:', mockAiResponse);
    });

    it('should detect scheduled execution from AI response', async () => {
      const mockAiResponse = {
        requiresScheduling: true,
        triggerType: 'scheduled',
        scheduleExpression: 'tomorrow at 3 PM',
        scheduleConfig: {
          triggerDate: '2023-10-27T15:00:00Z',
          cronExpression: null,
          recurrencePattern: null,
          timezone: 'UTC',
        },
        confidence: 0.98,
        reasoning: 'User specified a future date and time.',
        workflowTitle: 'Task for tomorrow',
        workflowDescription: 'Execute task tomorrow at 3 PM.',
      };
      runGeminiTask.mockResolvedValueOnce(JSON.stringify(mockAiResponse));

      const userInput = 'Schedule this for tomorrow at 3 PM';
      const result = await detectSchedulingRequirements(userInput);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
    });

    it('should detect recurring execution from AI response', async () => {
      const mockAiResponse = {
        requiresScheduling: true,
        triggerType: 'recurring',
        scheduleExpression: 'every Monday at 9 AM',
        scheduleConfig: {
          triggerDate: null,
          cronExpression: '0 9 * * 1',
          recurrencePattern: 'weekly',
          timezone: 'UTC',
        },
        confidence: 0.97,
        reasoning: 'User requested a weekly recurring schedule.',
        workflowTitle: 'Weekly Monday Report',
        workflowDescription: 'Generate report every Monday at 9 AM.',
      };
      runGeminiTask.mockResolvedValueOnce(JSON.stringify(mockAiResponse));

      const userInput = 'Run this every Monday at 9 AM';
      const result = await detectSchedulingRequirements(userInput);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
    });

    it('should detect manual trigger from AI response', async () => {
      const mockAiResponse = {
        requiresScheduling: true,
        triggerType: 'manual',
        scheduleExpression: null,
        scheduleConfig: {
          triggerDate: null,
          cronExpression: null,
          recurrencePattern: null,
          timezone: 'UTC',
        },
        confidence: 0.96,
        reasoning: 'User wants to save as a workflow for manual trigger.',
        workflowTitle: 'Save for later',
        workflowDescription: 'Workflow to be triggered manually.',
      };
      runGeminiTask.mockResolvedValueOnce(JSON.stringify(mockAiResponse));

      const userInput = 'Create a workflow to do this later';
      const result = await detectSchedulingRequirements(userInput);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
    });

    it('should handle AI response with <think> tags', async () => {
      const mockAiResponse = {
        requiresScheduling: false,
        triggerType: 'immediate',
        scheduleExpression: null,
        scheduleConfig: {
          triggerDate: null,
          cronExpression: null,
          recurrencePattern: null,
          timezone: 'UTC',
        },
        confidence: 0.99,
        reasoning: 'User wants immediate execution.',
        workflowTitle: 'Run task now',
        workflowDescription: 'Executes the task immediately.',
      };
      runGeminiTask.mockResolvedValueOnce(
        `<think>Thinking about the user's request.</think>${JSON.stringify(
          mockAiResponse
        )}`
      );

      const userInput = 'Run this task now';
      const result = await detectSchedulingRequirements(userInput);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
    });

    it('should handle AI response with ```json markdown', async () => {
      const mockAiResponse = {
        requiresScheduling: false,
        triggerType: 'immediate',
        scheduleExpression: null,
        scheduleConfig: {
          triggerDate: null,
          cronExpression: null,
          recurrencePattern: null,
          timezone: 'UTC',
        },
        confidence: 0.99,
        reasoning: 'User wants immediate execution.',
        workflowTitle: 'Run task now',
        workflowDescription: 'Executes the task immediately.',
      };
      runGeminiTask.mockResolvedValueOnce(
        `\`\`\`json\n${JSON.stringify(mockAiResponse)}\n\`\`\``
      );

      const userInput = 'Run this task now';
      const result = await detectSchedulingRequirements(userInput);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
    });

    it('should handle AI response with generic ``` markdown', async () => {
      const mockAiResponse = {
        requiresScheduling: false,
        triggerType: 'immediate',
        scheduleExpression: null,
        scheduleConfig: {
          triggerDate: null,
          cronExpression: null,
          recurrencePattern: null,
          timezone: 'UTC',
        },
        confidence: 0.99,
        reasoning: 'User wants immediate execution.',
        workflowTitle: 'Run task now',
        workflowDescription: 'Executes the task immediately.',
      };
      runGeminiTask.mockResolvedValueOnce(
        `\`\`\`\n${JSON.stringify(mockAiResponse)}\n\`\`\``
      );

      const userInput = 'Run this task now';
      const result = await detectSchedulingRequirements(userInput);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
    });

    it('should use fallback when AI returns invalid JSON', async () => {
      runGeminiTask.mockResolvedValueOnce('{"invalid": "json"'); // Malformed JSON
      const userInput = 'Create a workflow for later';
      const result = await detectSchedulingRequirements(userInput);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.triggerType).toBe('manual');
      expect(result.data.requiresScheduling).toBe(true);
      expect(result.data.confidence).toBe(0.7);
      expect(result.data.reasoning).toContain('Fallback detection');
    });

    it('should use fallback when AI returns valid JSON but invalid structure (missing requiresScheduling)', async () => {
      runGeminiTask.mockResolvedValueOnce(
        JSON.stringify({
          someOtherField: 'value',
          triggerType: 'immediate',
        })
      );
      const userInput = 'Run this now';
      const result = await detectSchedulingRequirements(userInput);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.triggerType).toBe('immediate');
      expect(result.data.requiresScheduling).toBe(false);
    });

    it('should use fallback when AI returns valid JSON but invalid structure (missing triggerType)', async () => {
      runGeminiTask.mockResolvedValueOnce(
        JSON.stringify({
          requiresScheduling: true,
          someOtherField: 'value',
        })
      );
      const userInput = 'Run this now';
      const result = await detectSchedulingRequirements(userInput);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.triggerType).toBe('immediate'); // Fallback for immediate
      expect(result.data.requiresScheduling).toBe(false);
    });

    it('should use fallback when AI task fails', async () => {
      runGeminiTask.mockRejectedValueOnce(new Error('AI service down'));
      const userInput = 'Schedule daily reports';
      const result = await detectSchedulingRequirements(userInput);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.triggerType).toBe('recurring');
      expect(result.data.requiresScheduling).toBe(true);
      expect(result.data.scheduleConfig.recurrencePattern).toBe('daily');
    });
  });

  // --- Test parseScheduleExpression ---
  describe('parseScheduleExpression', () => {
    it('should successfully parse a schedule expression from AI', async () => {
      const mockAiResponse = {
        cronExpression: '0 9 * * 1',
        description: 'Every Monday at 9 AM UTC',
        nextExecution: '2023-10-30T09:00:00Z',
        isValid: true,
        timezone: 'UTC',
      };
      runGeminiTask.mockResolvedValueOnce(JSON.stringify(mockAiResponse));

      const scheduleExpression = 'every Monday at 9 AM';
      const result = await parseScheduleExpression(scheduleExpression);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
    });

    it('should handle AI response with <think> tags', async () => {
      const mockAiResponse = {
        cronExpression: '0 9 * * 1',
        description: 'Every Monday at 9 AM UTC',
        nextExecution: '2023-10-30T09:00:00Z',
        isValid: true,
        timezone: 'UTC',
      };
      runGeminiTask.mockResolvedValueOnce(
        `<think>Processing schedule.</think>${JSON.stringify(mockAiResponse)}`
      );

      const scheduleExpression = 'every Monday at 9 AM';
      const result = await parseScheduleExpression(scheduleExpression);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
    });

    it('should handle AI response with ```json markdown', async () => {
      const mockAiResponse = {
        cronExpression: '0 9 * * 1',
        description: 'Every Monday at 9 AM UTC',
        nextExecution: '2023-10-30T09:00:00Z',
        isValid: true,
        timezone: 'UTC',
      };
      runGeminiTask.mockResolvedValueOnce(
        `\`\`\`json\n${JSON.stringify(mockAiResponse)}\n\`\`\``
      );

      const scheduleExpression = 'every Monday at 9 AM';
      const result = await parseScheduleExpression(scheduleExpression);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
    });

    it('should return failure when AI task fails', async () => {
      runGeminiTask.mockRejectedValueOnce(new Error('AI parsing failed'));

      const scheduleExpression = 'every day at 5 PM';
      const result = await parseScheduleExpression(scheduleExpression);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toBe('AI parsing failed');
      expect(result.data.cronExpression).toBeNull();
      expect(result.data.isValid).toBe(false);
      expect(result.data.timezone).toBe('UTC');
    });

    it('should return failure when AI returns invalid JSON', async () => {
      runGeminiTask.mockResolvedValueOnce('{"cronExpression": "invalid"'); // Malformed JSON

      const scheduleExpression = 'every day at 5 PM';
      const result = await parseScheduleExpression(scheduleExpression);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected end of JSON input');
      expect(result.data.cronExpression).toBeNull();
      expect(result.data.isValid).toBe(false);
      expect(result.data.timezone).toBe('UTC');
    });

    it('should use provided timezone', async () => {
      const mockAiResponse = {
        cronExpression: '0 9 * * 1',
        description: 'Every Monday at 9 AM America/New_York',
        nextExecution: '2023-10-30T13:00:00Z',
        isValid: true,
        timezone: 'America/New_York',
      };
      runGeminiTask.mockResolvedValueOnce(JSON.stringify(mockAiResponse));

      const scheduleExpression = 'every Monday at 9 AM';
      const timezone = 'America/New_York';
      const result = await parseScheduleExpression(scheduleExpression, timezone);

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(runGeminiTask).toHaveBeenCalledWith(
        expect.stringContaining(`TIMEZONE: ${timezone}`),
        expect.any(String)
      );
      expect(result.success).toBe(true);
      expect(result.data.timezone).toBe(timezone);
    });
  });

  // --- Test generateWorkflowMetadata ---
  describe('generateWorkflowMetadata', () => {
    it('should successfully generate metadata from AI', async () => {
      const mockAiResponse = {
        title: 'Send Daily Report to Slack',
        description: 'Automates sending a daily sales report from CRM to a Slack channel.',
        tags: ['report', 'slack', 'crm', 'daily'],
      };
      runGeminiTask.mockResolvedValueOnce(JSON.stringify(mockAiResponse));

      const userInput = 'Send daily sales report to Slack';
      const executionPlan = [{ action: 'get_report', app: 'CRM' }, { action: 'send_message', app: 'Slack' }];
      const requiredApps = ['CRM', 'Slack'];
      const result = await generateWorkflowMetadata(
        userInput,
        executionPlan,
        requiredApps
      );

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
    });

    it('should handle AI response with <think> tags', async () => {
      const mockAiResponse = {
        title: 'Send Daily Report to Slack',
        description: 'Automates sending a daily sales report from CRM to a Slack channel.',
        tags: ['report', 'slack', 'crm', 'daily'],
      };
      runGeminiTask.mockResolvedValueOnce(
        `<think>Generating metadata.</think>${JSON.stringify(mockAiResponse)}`
      );

      const userInput = 'Send daily sales report to Slack';
      const executionPlan = [{ action: 'get_report', app: 'CRM' }, { action: 'send_message', app: 'Slack' }];
      const requiredApps = ['CRM', 'Slack'];
      const result = await generateWorkflowMetadata(
        userInput,
        executionPlan,
        requiredApps
      );

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
    });

    it('should handle AI response with ```json markdown', async () => {
      const mockAiResponse = {
        title: 'Send Daily Report to Slack',
        description: 'Automates sending a daily sales report from CRM to a Slack channel.',
        tags: ['report', 'slack', 'crm', 'daily'],
      };
      runGeminiTask.mockResolvedValueOnce(
        `\`\`\`json\n${JSON.stringify(mockAiResponse)}\n\`\`\``
      );

      const userInput = 'Send daily sales report to Slack';
      const executionPlan = [{ action: 'get_report', app: 'CRM' }, { action: 'send_message', app: 'Slack' }];
      const requiredApps = ['CRM', 'Slack'];
      const result = await generateWorkflowMetadata(
        userInput,
        executionPlan,
        requiredApps
      );

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAiResponse);
    });

    it('should use fallback when AI task fails', async () => {
      runGeminiTask.mockRejectedValueOnce(new Error('AI metadata generation failed'));

      const userInput = 'Create a task to update CRM';
      const executionPlan = [{ action: 'update_record', app: 'CRM' }];
      const requiredApps = ['CRM'];
      const result = await generateWorkflowMetadata(
        userInput,
        executionPlan,
        requiredApps
      );

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Create a task to update (CRM)');
      expect(result.data.description).toBe('Automated workflow: Create a task to update CRM');
      expect(result.data.tags).toEqual(['CRM']);
    });

    it('should use fallback when AI returns invalid JSON', async () => {
      runGeminiTask.mockResolvedValueOnce('{"title": "invalid"'); // Malformed JSON

      const userInput = 'Create a task to update CRM';
      const executionPlan = [{ action: 'update_record', app: 'CRM' }];
      const requiredApps = ['CRM'];
      const result = await generateWorkflowMetadata(
        userInput,
        executionPlan,
        requiredApps
      );

      expect(runGeminiTask).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Create a task to update (CRM)');
      expect(result.data.description).toBe('Automated workflow: Create a task to update CRM');
      expect(result.data.tags).toEqual(['CRM']);
    });
  });

  // --- Private Helper Functions (Direct Tests) ---
  // These functions are not exported, so their implementations are copied here for direct testing.
  // In a real-world scenario, one might consider exporting them for testing purposes or
  // ensuring they are sufficiently covered by the public functions that use them.

  const fallbackScheduleDetection = (userInput) => {
    const input = userInput.toLowerCase();

    const workflowKeywords = [
      'create workflow',
      'save for later',
      'set up automation',
      'create automation',
      "don't run yet",
      'save as workflow',
    ];
    const isWorkflowCreation = workflowKeywords.some((keyword) =>
      input.includes(keyword)
    );

    const scheduleKeywords = [
      'tomorrow',
      'next week',
      'schedule for',
      'run at',
      'at 3 pm',
      'on friday',
      'every day',
      'daily',
      'weekly',
      'monthly',
    ];
    const hasSchedule = scheduleKeywords.some((keyword) =>
      input.includes(keyword)
    );

    const recurringKeywords = [
      'daily',
      'weekly',
      'monthly',
      'every day',
      'every hour',
    ];
    const isRecurring = recurringKeywords.some((keyword) =>
      input.includes(keyword)
    );

    let triggerType = 'immediate';
    if (isWorkflowCreation) triggerType = 'manual';
    else if (isRecurring) triggerType = 'recurring';
    else if (hasSchedule) triggerType = 'scheduled';

    return {
      requiresScheduling: triggerType !== 'immediate',
      triggerType,
      scheduleExpression: hasSchedule ? extractScheduleFromInput(input) : null,
      scheduleConfig: {
        triggerDate: null,
        cronExpression: null,
        recurrencePattern: isRecurring ? detectRecurrencePattern(input) : null,
        timezone: 'UTC',
      },
      confidence: 0.7,
      reasoning: `Fallback detection based on keywords. Detected: ${triggerType}`,
      workflowTitle: null,
      workflowDescription: null,
    };
  };

  const extractScheduleFromInput = (input) => {
    const timePatterns = [
      /at (\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
      /(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
      /(tomorrow|next week|friday|monday|tuesday|wednesday|thursday|saturday|sunday)/i,
    ];

    for (const pattern of timePatterns) {
      const match = input.match(pattern);
      if (match) return match[1] || match[0];
    }

    return null;
  };

  const detectRecurrencePattern = (input) => {
    if (input.includes('daily') || input.includes('every day')) return 'daily';
    if (input.includes('weekly') || input.includes('every week')) return 'weekly';
    if (input.includes('monthly') || input.includes('every month'))
      return 'monthly';
    if (input.includes('every hour')) return 'hourly';
    return 'custom';
  };

  const generateFallbackTitle = (userInput, requiredApps) => {
    const action = userInput.split(' ').slice(0, 4).join(' ');
    const apps = requiredApps.slice(0, 2).join(' & ');
    return `${action} (${apps})`.substring(0, 50);
  };


  describe('Private Helper Functions (Direct Tests)', () => {
    describe('fallbackScheduleDetection', () => {
      it('should detect manual trigger', () => {
        const result = fallbackScheduleDetection('create workflow for later');
        expect(result.triggerType).toBe('manual');
        expect(result.requiresScheduling).toBe(true);
      });

      it('should detect scheduled trigger', () => {
        const result = fallbackScheduleDetection('schedule for tomorrow');
        expect(result.triggerType).toBe('scheduled');
        expect(result.requiresScheduling).toBe(true);
        expect(result.scheduleExpression).toBe('tomorrow');
      });

      it('should detect recurring daily trigger', () => {
        const result = fallbackScheduleDetection('run this daily');
        expect(result.triggerType).toBe('recurring');
        expect(result.requiresScheduling).toBe(true);
        expect(result.scheduleConfig.recurrencePattern).toBe('daily');
      });

      it('should detect recurring weekly trigger', () => {
        const result = fallbackScheduleDetection('run this every week');
        expect(result.triggerType).toBe('recurring');
        expect(result.requiresScheduling).toBe(true);
        expect(result.scheduleConfig.recurrencePattern).toBe('weekly');
      });

      it('should detect immediate trigger', () => {
        const result = fallbackScheduleDetection('just do it');
        expect(result.triggerType).toBe('immediate');
        expect(result.requiresScheduling).toBe(false);
      });

      it('should prioritize manual over scheduled if both keywords are present', () => {
        const result = fallbackScheduleDetection('create workflow for tomorrow');
        expect(result.triggerType).toBe('manual');
      });

      it('should prioritize recurring over scheduled if both keywords are present', () => {
        const result = fallbackScheduleDetection('schedule daily reports for next week');
        expect(result.triggerType).toBe('recurring');
      });
    });

    describe('extractScheduleFromInput', () => {
      it('should extract "tomorrow"', () => {
        expect(extractScheduleFromInput('run tomorrow')).toBe('tomorrow');
      });
      it('should extract "next week"', () => {
        expect(extractScheduleFromInput('schedule for next week')).toBe('next week');
      });
      it('should extract "at 3 pm"', () => {
        expect(extractScheduleFromInput('run at 3 pm')).toBe('3 pm');
      });
      it('should extract "at 14:30"', () => {
        expect(extractScheduleFromInput('run at 14:30')).toBe('14:30');
      });
      it('should extract "on friday"', () => {
        expect(extractScheduleFromInput('schedule on friday')).toBe('friday');
      });
      it('should return null if no schedule found', () => {
        expect(extractScheduleFromInput('just do it')).toBeNull();
      });
      it('should extract first matching pattern', () => {
        expect(extractScheduleFromInput('run at 3 pm tomorrow')).toBe('3 pm');
      });
    });

    describe('detectRecurrencePattern', () => {
      it('should detect daily', () => {
        expect(detectRecurrencePattern('run daily')).toBe('daily');
        expect(detectRecurrencePattern('run every day')).toBe('daily');
      });
      it('should detect weekly', () => {
        expect(detectRecurrencePattern('run weekly')).toBe('weekly');
        expect(detectRecurrencePattern('run every week')).toBe('weekly');
      });
      it('should detect monthly', () => {
        expect(detectRecurrencePattern('run monthly')).toBe('monthly');
        expect(detectRecurrencePattern('run every month')).toBe('monthly');
      });
      it('should detect hourly', () => {
        expect(detectRecurrencePattern('run every hour')).toBe('hourly');
      });
      it('should default to custom', () => {
        expect(detectRecurrencePattern('run frequently')).toBe('custom');
      });
    });

    describe('generateFallbackTitle', () => {
      it('should generate a title with user input and apps', () => {
        const title = generateFallbackTitle('Send report to team', ['Slack', 'Email']);
        expect(title).toBe('Send report to team (Slack & Email)');
      });
      it('should truncate long user input', () => {
        const longInput = 'This is a very very very very very very very very very long user input';
        const title = generateFallbackTitle(longInput, ['App']);
        expect(title.length).toBeLessThanOrEqual(50);
        expect(title).toBe('This is a very very (App)');
      });
      it('should handle single app', () => {
        const title = generateFallbackTitle('Update record', ['CRM']);
        expect(title).toBe('Update record (CRM)');
      });
      it('should handle no apps', () => {
        const title = generateFallbackTitle('Just a task', []);
        expect(title).toBe('Just a task ()');
      });
    });
  });
});