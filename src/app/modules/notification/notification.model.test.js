import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Notification from './notification.model'; // Adjust path as necessary

describe('Notification Model Schema', () => {
  // Ensure the exported Notification is a Mongoose model
  it('should be a Mongoose model', () => {
    expect(Notification.modelName).toBe('Notification');
    expect(Notification.schema).toBeInstanceOf(mongoose.Schema);
  });

  // Test individual field properties
  describe('Schema fields definition', () => {
    const schema = Notification.schema;

    it('should have a "title" field of type String, required, and trimmed', () => {
      const title = schema.paths.title;
      expect(title).toBeDefined();
      expect(title.instance).toBe('String');
      expect(title.isRequired).toBe(true);
      expect(title.options.trim).toBe(true);
      expect(title.options.required[0]).toBe('Notification title is required');
    });

    it('should have a "description" field of type String, required, and trimmed', () => {
      const description = schema.paths.description;
      expect(description).toBeDefined();
      expect(description.instance).toBe('String');
      expect(description.isRequired).toBe(true);
      expect(description.options.trim).toBe(true);
      expect(description.options.required[0]).toBe('Notification description is required');
    });

    it('should have an "isRead" field of type Boolean with a default of false', () => {
      const isRead = schema.paths.isRead;
      expect(isRead).toBeDefined();
      expect(isRead.instance).toBe('Boolean');
      expect(isRead.defaultValue).toBe(false);
    });

    it('should have a "link" field of type String and trimmed', () => {
      const link = schema.paths.link;
      expect(link).toBeDefined();
      expect(link.instance).toBe('String');
      expect(link.options.trim).toBe(true);
      expect(link.isRequired).toBeUndefined(); // Not required
    });

    it('should have a "type" field of type String with enum values and a default of "default"', () => {
      const type = schema.paths.type;
      expect(type).toBeDefined();
      expect(type.instance).toBe('String');
      expect(type.enum).toEqual(['default', 'request']);
      expect(type.defaultValue).toBe('default');
    });

    it('should have a "category" field of type String without enum or default', () => {
      const category = schema.paths.category;
      expect(category).toBeDefined();
      expect(category.instance).toBe('String');
      expect(category.enum).toBeUndefined();
      expect(category.defaultValue).toBeUndefined();
    });

    it('should have a "userId" field of type ObjectId referencing "User"', () => {
      const userId = schema.paths.userId;
      expect(userId).toBeDefined();
      expect(userId.instance).toBe('ObjectID');
      expect(userId.options.ref).toBe('User');
    });

    it('should have an "isArchived" field of type Boolean with a default of false', () => {
      const isArchived = schema.paths.isArchived;
      expect(isArchived).toBeDefined();
      expect(isArchived.instance).toBe('Boolean');
      expect(isArchived.defaultValue).toBe(false);
    });

    it('should have a "payload" field of type Map with Mixed values and a default of an empty object', () => {
      const payload = schema.paths.payload;
      expect(payload).toBeDefined();
      expect(payload.instance).toBe('Map');
      expect(payload.caster.instance).toBe('Mixed'); // For Map types, 'of' is in caster.instance
      expect(payload.defaultValue).toEqual({});
    });

    it('should have a "tenantId" field of type ObjectId referencing "Tenant", with default null and indexed', () => {
      const tenantId = schema.paths.tenantId;
      expect(tenantId).toBeDefined();
      expect(tenantId.instance).toBe('ObjectID');
      expect(tenantId.options.ref).toBe('Tenant');
      expect(tenantId.defaultValue).toBeNull();
      expect(tenantId.options.index).toBe(true);
    });
  });

  it('should have timestamps enabled', () => {
    expect(Notification.schema.options.timestamps).toBe(true);
  });

  // Test schema validation without a database connection
  describe('Schema validation', () => {
    it('should require title and description', async () => {
      const notification = new Notification({});
      let error;
      try {
        await notification.validate();
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.errors.title).toBeDefined();
      expect(error.errors.title.message).toBe('Notification title is required');
      expect(error.errors.description).toBeDefined();
      expect(error.errors.description.message).toBe('Notification description is required');
    });

    it('should set default values correctly for isRead, isArchived, type, payload, and tenantId', async () => {
      const notification = new Notification({
        title: 'Test Notification',
        description: 'This is a test description.',
        userId: new mongoose.Types.ObjectId(),
      });

      await notification.validate(); // Triggers default value application

      expect(notification.isRead).toBe(false);
      expect(notification.isArchived).toBe(false);
      expect(notification.type).toBe('default');
      expect(notification.payload).toEqual({});
      expect(notification.tenantId).toBeNull();
    });

    it('should not allow invalid "type" enum values', async () => {
      const notification = new Notification({
        title: 'Test Notification',
        description: 'This is a test description.',
        type: 'invalid_type',
        userId: new mongoose.Types.ObjectId(),
      });

      let error;
      try {
        await notification.validate();
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.errors.type).toBeDefined();
      expect(error.errors.type.message).toContain('`invalid_type` is not a valid enum value for path `type`.');
    });

    it('should trim string fields before validation', async () => {
      const notification = new Notification({
        title: '  Trimmed Title  ',
        description: '  Trimmed Description  ',
        link: '  https://example.com  ',
        userId: new mongoose.Types.ObjectId(),
      });

      await notification.validate();

      expect(notification.title).toBe('Trimmed Title');
      expect(notification.description).toBe('Trimmed Description');
      expect(notification.link).toBe('https://example.com');
    });

    it('should successfully validate a notification with all valid fields', async () => {
      const userId = new mongoose.Types.ObjectId();
      const tenantId = new mongoose.Types.ObjectId();
      const notification = new Notification({
        title: 'Valid Notification',
        description: 'This is a valid description.',
        isRead: true,
        link: 'http://example.com',
        type: 'request',
        category: 'system',
        userId: userId,
        isArchived: true,
        payload: { key: 'value' },
        tenantId: tenantId,
      });

      let error;
      try {
        await notification.validate();
      } catch (err) {
        error = err;
      }
      expect(error).toBeUndefined(); // No validation error

      expect(notification.title).toBe('Valid Notification');
      expect(notification.description).toBe('This is a valid description.');
      expect(notification.isRead).toBe(true);
      expect(notification.link).toBe('http://example.com');
      expect(notification.type).toBe('request');
      expect(notification.category).toBe('system');
      expect(notification.userId.toString()).toBe(userId.toString());
      expect(notification.isArchived).toBe(true);
      // Mongoose converts plain objects to Mongoose Maps for Map types
      expect(notification.payload).toEqual(new mongoose.Types.Map(Object.entries({ key: 'value' })));
      expect(notification.tenantId.toString()).toBe(tenantId.toString());
    });
  });
});