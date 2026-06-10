import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import EventTrigger from '../eventTrigger.model'; // Adjust path as necessary

describe('EventTrigger Model', () => {
  // Mongoose models can be tested for schema validation and properties
  // without connecting to a real database.
  // We don't need to mock mongoose.connect or manage a connection for these tests.

  it('should be a defined Mongoose model', () => {
    expect(EventTrigger).toBeDefined();
    expect(EventTrigger.modelName).toBe('EventTrigger');
    expect(EventTrigger.schema).toBeDefined();
    expect(EventTrigger.schema).toBeInstanceOf(mongoose.Schema);
  });

  it('should have correct schema properties for userId', () => {
    const schema = EventTrigger.schema;
    const userIdPath = schema.paths.userId;
    expect(userIdPath).toBeDefined();
    expect(userIdPath.instance).toBe('String');
    expect(userIdPath.isRequired).toBe(true);
    expect(userIdPath._index).toEqual(true);
  });

  it('should have correct schema properties for appName', () => {
    const schema = EventTrigger.schema;
    const appNamePath = schema.paths.appName;
    expect(appNamePath).toBeDefined();
    expect(appNamePath.instance).toBe('String');
    expect(appNamePath.isRequired).toBe(true);
    expect(appNamePath._index).toEqual(true);
  });

  it('should have correct schema properties for eventName', () => {
    const schema = EventTrigger.schema;
    const eventNamePath = schema.paths.eventName;
    expect(eventNamePath).toBeDefined();
    expect(eventNamePath.instance).toBe('String');
    expect(eventNamePath.isRequired).toBe(true);
    expect(eventNamePath._index).toEqual(true);
  });

  it('should have correct schema properties for dispatchType', () => {
    const schema = EventTrigger.schema;
    const dispatchTypePath = schema.paths.dispatchType;
    expect(dispatchTypePath).toBeDefined();
    expect(dispatchTypePath.instance).toBe('String');
    expect(dispatchTypePath.isRequired).toBe(true);
    expect(dispatchTypePath.enumValues).toEqual(['workflow', 'chain']);
    expect(dispatchTypePath.defaultValue).toBe('workflow');
  });

  it('should have correct schema properties for targetId', () => {
    const schema = EventTrigger.schema;
    const targetIdPath = schema.paths.targetId;
    expect(targetIdPath).toBeDefined();
    expect(targetIdPath.instance).toBe('String');
    expect(targetIdPath.isRequired).toBe(true);
  });

  it('should have correct schema properties for paramMapping', () => {
    const schema = EventTrigger.schema;
    const paramMappingPath = schema.paths.paramMapping;
    expect(paramMappingPath).toBeDefined();
    expect(paramMappingPath.instance).toBe('Mixed');
    expect(paramMappingPath.defaultValue).toEqual({});
  });

  it('should have correct schema properties for isActive', () => {
    const schema = EventTrigger.schema;
    const isActivePath = schema.paths.isActive;
    expect(isActivePath).toBeDefined();
    expect(isActivePath.instance).toBe('Boolean');
    expect(isActivePath.defaultValue).toBe(true);
  });

  it('should have timestamps enabled', () => {
    const schema = EventTrigger.schema;
    expect(schema.options.timestamps).toBe(true);
    expect(schema.paths.createdAt).toBeDefined();
    expect(schema.paths.updatedAt).toBeDefined();
    expect(schema.paths.createdAt.instance).toBe('Date');
    expect(schema.paths.updatedAt.instance).toBe('Date');
  });

  it('should enforce required fields validation', async () => {
    const invalidTrigger = new EventTrigger({}); // Missing all required fields

    let error;
    try {
      await invalidTrigger.validate();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.errors.userId).toBeDefined();
    expect(error.errors.appName).toBeDefined();
    expect(error.errors.eventName).toBeDefined();
    expect(error.errors.dispatchType).toBeDefined();
    expect(error.errors.targetId).toBeDefined();
  });

  it('should apply default values correctly on instantiation', () => {
    const trigger = new EventTrigger({
      userId: 'user123',
      appName: 'testApp',
      eventName: 'testEvent',
      targetId: 'target123',
    });

    expect(trigger.dispatchType).toBe('workflow');
    expect(trigger.paramMapping).toEqual({});
    expect(trigger.isActive).toBe(true);
  });

  it('should enforce enum validation for dispatchType', async () => {
    const invalidTrigger = new EventTrigger({
      userId: 'user123',
      appName: 'testApp',
      eventName: 'testEvent',
      dispatchType: 'invalidType', // Invalid enum value
      targetId: 'target123',
    });

    let error;
    try {
      await invalidTrigger.validate();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.errors.dispatchType).toBeDefined();
    expect(error.errors.dispatchType.kind).toBe('enum');
  });

  it('should define a compound unique index', () => {
    const schema = EventTrigger.schema;
    const indexes = schema.indexes();

    // Mongoose stores indexes as an array of [fieldSpec, options]
    const compoundIndex = indexes.find(
      ([fields, options]) =>
        fields.userId === 1 &&
        fields.appName === 1 &&
        fields.eventName === 1 &&
        options.unique === true
    );

    expect(compoundIndex).toBeDefined();
  });

  it('should create a valid event trigger instance', async () => {
    const validTrigger = new EventTrigger({
      userId: 'user123',
      appName: 'github',
      eventName: 'issue.opened',
      dispatchType: 'workflow',
      targetId: 'workflow456',
      paramMapping: {
        'body.issue.title': 'title',
        'body.issue.body': 'description',
      },
      isActive: false,
    });

    let error;
    try {
      await validTrigger.validate();
    } catch (e) {
      error = e;
    }

    expect(error).toBeUndefined();
    expect(validTrigger.userId).toBe('user123');
    expect(validTrigger.appName).toBe('github');
    expect(validTrigger.eventName).toBe('issue.opened');
    expect(validTrigger.dispatchType).toBe('workflow');
    expect(validTrigger.targetId).toBe('workflow456');
    expect(validTrigger.paramMapping).toEqual({
      'body.issue.title': 'title',
      'body.issue.body': 'description',
    });
    expect(validTrigger.isActive).toBe(false);
    // createdAt and updatedAt are set by Mongoose on save, not on instantiation
    expect(validTrigger.createdAt).toBeUndefined();
    expect(validTrigger.updatedAt).toBeUndefined();
  });
});