import { describe, it, expect } from 'vitest';
import { aiClassificationState } from './state';

describe('aiClassificationState', () => {
  it('should be defined and an object', () => {
    expect(aiClassificationState).toBeDefined();
    expect(typeof aiClassificationState).toBe('object');
  });

  it('should have all expected state properties initialized with null values by default, except for specific ones', () => {
    const expectedNullProperties = [
      'userInput', 'availableApps', 'availableActions', 'identifiedApp',
      'identifiedAction', 'confidence', 'availableTools', 'relevantTools',
      'extractedParameters', 'executionResult', 'response', 'error',
      'metadata', 'finalResponse', 'workflowType', 'executionPlan',
      'stepSummaries', 'dependencyGraph', 'planningMetadata', 'requiredApps',
      'userId', 'connectedAccounts', 'threadId', 'lastStepResult',
      'schedulingRequirements', 'workflowTemplate', 'scheduleExpression',
      'scheduleConfig', 'workflowId', 'originalUserInput',
      'scheduleType', 'cronExpression', 'oneTimeDate', 'timezone',
      'scheduleDescription', 'scheduleMetadata', 'workflowTitle', 'workflowDescription'
    ];

    expectedNullProperties.forEach(prop => {
      expect(aiClassificationState).toHaveProperty(prop);
      expect(aiClassificationState[prop]).toHaveProperty('value', null);
    });

    expect(aiClassificationState.currentStep).toHaveProperty('value', 0);
    expect(aiClassificationState.stepResults).toHaveProperty('value', []);
    expect(aiClassificationState.crossStepParameters).toHaveProperty('value', {});
    expect(aiClassificationState.workflowComplete).toHaveProperty('value', false);
    expect(aiClassificationState.currentStage).toHaveProperty('value', 'initial');
    expect(aiClassificationState.triggerType).toHaveProperty('value', 'immediate');
    expect(aiClassificationState.workflowSaved).toHaveProperty('value', false);
    expect(aiClassificationState.shouldSaveWorkflow).toHaveProperty('value', false);
    expect(aiClassificationState.needsScheduling).toHaveProperty('value', false);
    expect(aiClassificationState.schedulingDetected).toHaveProperty('value', false);
  });

  describe('history property', () => {
    it('should have a value function that merges arrays', () => {
      const { value } = aiClassificationState.history;
      expect(typeof value).toBe('function');

      // Test cases for the value function
      expect(value(null, null)).toEqual([]);
      expect(value(null, [{ id: 1 }])).toEqual([{ id: 1 }]);
      expect(value([{ id: 1 }], null)).toEqual([{ id: 1 }]);
      expect(value([{ id: 1 }], [{ id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
      expect(value([{ id: 1 }, { id: 2 }], [{ id: 3 }, { id: 4 }])).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    });

    it('should have a default function that returns an empty array', () => {
      const { default: defaultValue } = aiClassificationState.history;
      expect(typeof defaultValue).toBe('function');
      expect(defaultValue()).toEqual([]);
    });
  });

  describe('messages property', () => {
    it('should have a value function that merges arrays', () => {
      const { value } = aiClassificationState.messages;
      expect(typeof value).toBe('function');

      // Test cases for the value function
      expect(value(null, null)).toEqual([]);
      expect(value(null, [{ text: 'hi' }])).toEqual([{ text: 'hi' }]);
      expect(value([{ text: 'hi' }], null)).toEqual([{ text: 'hi' }]);
      expect(value([{ text: 'hi' }], [{ text: 'hello' }])).toEqual([{ text: 'hi' }, { text: 'hello' }]);
      expect(value([{ text: 'hi' }, { text: 'how are you' }], [{ text: 'I am good' }])).toEqual([{ text: 'hi' }, { text: 'how are you' }, { text: 'I am good' }]);
    });

    it('should have a default function that returns an empty array', () => {
      const { default: defaultValue } = aiClassificationState.messages;
      expect(typeof defaultValue).toBe('function');
      expect(defaultValue()).toEqual([]);
    });
  });

  describe('conversationContext property', () => {
    it('should have a default function that returns the correct initial context object', () => {
      const { default: defaultValue } = aiClassificationState.conversationContext;
      expect(typeof defaultValue).toBe('function');
      expect(defaultValue()).toEqual({
        lastApp: null,
        lastAction: null,
        lastParameters: null,
        recentTools: [],
        userPreferences: {},
        conversationSummary: '',
        turnCount: 0,
      });
    });
  });

  describe('executionMode property', () => {
    it('should have a default function that returns "immediate"', () => {
      const { default: defaultValue } = aiClassificationState.executionMode;
      expect(typeof defaultValue).toBe('function');
      expect(defaultValue()).toBe('immediate');
    });

    it('should have a value of "immediate" by default', () => {
      expect(aiClassificationState.executionMode).toHaveProperty('value', 'immediate');
    });
  });
});