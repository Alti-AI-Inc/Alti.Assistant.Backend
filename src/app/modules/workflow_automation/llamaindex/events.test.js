import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the @llamaindex/workflow-core module
// This must be done before importing the module under test to ensure the mock is active
vi.mock('@llamaindex/workflow-core', () => {
  // Create a mock function for workflowEvent
  const mockWorkflowEvent = vi.fn((options) => ({
    // Return a simple object that includes the debugLabel for verification.
    // This mimics the expected output structure of a workflow event.
    debugLabel: options.debugLabel,
    _isMockEvent: true, // A marker to easily identify mock event objects
  }));
  return {
    workflowEvent: mockWorkflowEvent,
  };
});

// Now import the module under test after the mock is set up
import * as events from './events';

// Get the reference to the mocked workflowEvent function
import { workflowEvent } from '@llamaindex/workflow-core';

describe('Workflow Automation LlamaIndex Events', () => {
  beforeEach(() => {
    // Clear all mocks before each test to ensure test isolation
    vi.clearAllMocks();
  });

  it('should export all expected ingestion pipeline events', () => {
    const expectedIngestionEvents = [
      'IngestionStartEvent',
      'DocumentLoadedEvent',
      'NodesGeneratedEvent',
      'IndexBuiltEvent',
      'IngestionCompleteEvent',
    ];

    expectedIngestionEvents.forEach(eventName => {
      expect(events).toHaveProperty(eventName);
      // Verify that the exported constant is an object created by our mock
      expect(typeof events[eventName]).toBe('object');
      expect(events[eventName]).toHaveProperty('_isMockEvent', true);
      // Verify the debugLabel property, which comes from the mock's return value
      expect(events[eventName]).toHaveProperty('debugLabel', eventName);
    });
  });

  it('should export all expected search & retrieval events', () => {
    const expectedSearchEvents = [
      'SearchStartEvent',
      'CacheHitEvent',
      'RouteSelectedEvent',
      'ContextRetrievedEvent',
      'ResponseSynthesizedEvent',
      'SearchCompleteEvent',
    ];

    expectedSearchEvents.forEach(eventName => {
      expect(events).toHaveProperty(eventName);
      // Verify that the exported constant is an object created by our mock
      expect(typeof events[eventName]).toBe('object');
      expect(events[eventName]).toHaveProperty('_isMockEvent', true);
      // Verify the debugLabel property, which comes from the mock's return value
      expect(events[eventName]).toHaveProperty('debugLabel', eventName);
    });
  });

  it('should call workflowEvent for each exported event with the correct debugLabel', () => {
    // There are 5 ingestion events and 6 search events, totaling 11 events.
    expect(workflowEvent).toHaveBeenCalledTimes(11);

    const expectedCalls = [
      { debugLabel: 'IngestionStartEvent' },
      { debugLabel: 'DocumentLoadedEvent' },
      { debugLabel: 'NodesGeneratedEvent' },
      { debugLabel: 'IndexBuiltEvent' },
      { debugLabel: 'IngestionCompleteEvent' },
      { debugLabel: 'SearchStartEvent' },
      { debugLabel: 'CacheHitEvent' },
      { debugLabel: 'RouteSelectedEvent' },
      { debugLabel: 'ContextRetrievedEvent' },
      { debugLabel: 'ResponseSynthesizedEvent' },
      { debugLabel: 'SearchCompleteEvent' },
    ];

    // Verify that workflowEvent was called with the exact options for each event
    expectedCalls.forEach(expectedArg => {
      expect(workflowEvent).toHaveBeenCalledWith(expectedArg);
    });
  });

  it('should ensure all exported events are distinct objects', () => {
    const allEvents = [
      events.IngestionStartEvent,
      events.DocumentLoadedEvent,
      events.NodesGeneratedEvent,
      events.IndexBuiltEvent,
      events.IngestionCompleteEvent,
      events.SearchStartEvent,
      events.CacheHitEvent,
      events.RouteSelectedEvent,
      events.ContextRetrievedEvent,
      events.ResponseSynthesizedEvent,
      events.SearchCompleteEvent,
    ];

    // Use a Set to check for uniqueness of object references.
    // If all objects are distinct, the size of the Set should equal the original array length.
    const uniqueEvents = new Set(allEvents);
    expect(uniqueEvents.size).toBe(allEvents.length);
  });
});