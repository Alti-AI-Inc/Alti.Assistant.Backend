import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import ComposioAuth from './composio.model.js';

describe('ComposioAuth Model', () => {

  it('should create a valid ComposioAuth instance with all fields', () => {
    const userId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const authData = {
      userId,
      authConfigId: 'google-drive-123',
      redirectUrl: 'https://app.example.com/callback',
      connectedAccountId: 'conn-abc-123',
      integrationId: 'int-xyz-456',
      status: 'ACTIVE',
      accessToken: 'access-token-string',
      refreshToken: 'refresh-token-string',
      idToken: 'id-token-string',
      toolkit: {
        slug: 'google-drive',
        name: 'Google Drive',
        description: 'Access Google Drive files.',
        icon: 'gdrive.png',
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        metadata: { version: 'v3' },
      },
      tenantId,
    };

    const auth = new ComposioAuth(authData);
    const error = auth.validateSync();

    expect(error).toBeUndefined();
    expect(auth.userId).toBe(userId);
    expect(auth.authConfigId).toBe('google-drive-123');
    expect(auth.redirectUrl).toBe('https://app.example.com/callback');
    expect(auth.status).toBe('ACTIVE');
    expect(auth.toolkit.slug).toBe('google-drive');
    expect(auth.tenantId).toBe(tenantId);
  });

  it('should fail validation if required field "userId" is missing', () => {
    const authData = {
      authConfigId: 'google-drive-123',
      redirectUrl: 'https://app.example.com/callback',
    };
    const auth = new ComposioAuth(authData);
    const error = auth.validateSync();
    expect(error).toBeDefined();
    expect(error.errors.userId).toBeDefined();
    expect(error.errors.userId.message).toBe('Path `userId` is required.');
  });

  it('should fail validation if required field "authConfigId" is missing', () => {
    const authData = {
      userId: new mongoose.Types.ObjectId(),
      redirectUrl: 'https://app.example.com/callback',
    };
    const auth = new ComposioAuth(authData);
    const error = auth.validateSync();
    expect(error).toBeDefined();
    expect(error.errors.authConfigId).toBeDefined();
    expect(error.errors.authConfigId.message).toBe('Path `authConfigId` is required.');
  });

  it('should fail validation if required field "redirectUrl" is missing', () => {
    const authData = {
      userId: new mongoose.Types.ObjectId(),
      authConfigId: 'google-drive-123',
    };
    const auth = new ComposioAuth(authData);
    const error = auth.validateSync();
    expect(error).toBeDefined();
    expect(error.errors.redirectUrl).toBeDefined();
    expect(error.errors.redirectUrl.message).toBe('Path `redirectUrl` is required.');
  });

  it('should set default status to "PENDING" if not provided', () => {
    const authData = {
      userId: new mongoose.Types.ObjectId(),
      authConfigId: 'google-drive-123',
      redirectUrl: 'https://app.example.com/callback',
    };
    const auth = new ComposioAuth(authData);
    expect(auth.status).toBe('PENDING');
  });

  it('should uppercase the status field on set', () => {
    const authData = {
      userId: new mongoose.Types.ObjectId(),
      authConfigId: 'google-drive-123',
      redirectUrl: 'https://app.example.com/callback',
      status: 'active',
    };
    const auth = new ComposioAuth(authData);
    expect(auth.status).toBe('ACTIVE');
  });

  it('should fail validation for an invalid status value', () => {
    const authData = {
      userId: new mongoose.Types.ObjectId(),
      authConfigId: 'google-drive-123',
      redirectUrl: 'https://app.example.com/callback',
      status: 'DELETED', // Not in the enum list
    };
    const auth = new ComposioAuth(authData);
    const error = auth.validateSync();
    expect(error).toBeDefined();
    expect(error.errors.status).toBeDefined();
    expect(error.errors.status.message).toContain('`DELETED` is not a valid enum value for path `status`');
  });

  it('should set default tenantId to null if not provided', () => {
    const authData = {
      userId: new mongoose.Types.ObjectId(),
      authConfigId: 'google-drive-123',
      redirectUrl: 'https://app.example.com/callback',
    };
    const auth = new ComposioAuth(authData);
    expect(auth.tenantId).toBe(null);
  });

  describe('Embedded Toolkit Schema', () => {
    it('should correctly validate a valid embedded toolkit sub-document', () => {
      const authData = {
        userId: new mongoose.Types.ObjectId(),
        authConfigId: 'google-drive-123',
        redirectUrl: 'https://app.example.com/callback',
        toolkit: {
          slug: 'google-drive',
          name: 'Google Drive',
        },
      };
      const auth = new ComposioAuth(authData);
      const error = auth.validateSync();
      expect(error).toBeUndefined();
      expect(auth.toolkit.slug).toBe('google-drive');
      expect(auth.toolkit.name).toBe('Google Drive');
    });

    it('should fail validation if required field "slug" in toolkit is missing', () => {
      const authData = {
        userId: new mongoose.Types.ObjectId(),
        authConfigId: 'google-drive-123',
        redirectUrl: 'https://app.example.com/callback',
        toolkit: {
          name: 'Google Drive', // slug is missing
        },
      };
      const auth = new ComposioAuth(authData);
      const error = auth.validateSync();
      expect(error).toBeDefined();
      expect(error.errors['toolkit.slug']).toBeDefined();
      expect(error.errors['toolkit.slug'].message).toBe('Path `slug` is required.');
    });

    it('should fail validation if required field "name" in toolkit is missing', () => {
      const authData = {
        userId: new mongoose.Types.ObjectId(),
        authConfigId: 'google-drive-123',
        redirectUrl: 'https://app.example.com/callback',
        toolkit: {
          slug: 'google-drive', // name is missing
        },
      };
      const auth = new ComposioAuth(authData);
      const error = auth.validateSync();
      expect(error).toBeDefined();
      expect(error.errors['toolkit.name']).toBeDefined();
      expect(error.errors['toolkit.name'].message).toBe('Path `name` is required.');
    });

    it('should not have an _id field in the toolkit sub-document', () => {
        const authData = {
            userId: new mongoose.Types.ObjectId(),
            authConfigId: 'google-drive-123',
            redirectUrl: 'https://app.example.com/callback',
            toolkit: {
              slug: 'google-drive',
              name: 'Google Drive',
            },
          };
          const auth = new ComposioAuth(authData);
          expect(auth.toolkit._id).toBeUndefined();
    });
  });

  describe('Schema Configuration', () => {
    it('should have timestamps enabled', () => {
      expect(ComposioAuth.schema.options.timestamps).toBe(true);
    });

    it('should have the correct indexes defined', () => {
      const indexes = ComposioAuth.schema.indexes();
      const indexSpecs = indexes.map(index => index[0]);

      // Check for single-field indexes
      expect(indexSpecs).toContainEqual({ userId: 1 });
      expect(indexSpecs).toContainEqual({ authConfigId: 1 });
      expect(indexSpecs).toContainEqual({ connectedAccountId: 1 });
      expect(indexSpecs).toContainEqual({ tenantId: 1 });

      // Check for compound indexes
      expect(indexSpecs).toContainEqual({ userId: 1, status: 1, 'toolkit.slug': 1 });
      expect(indexSpecs).toContainEqual({ userId: 1, status: 1, authConfigId: 1 });
    });
  });
});