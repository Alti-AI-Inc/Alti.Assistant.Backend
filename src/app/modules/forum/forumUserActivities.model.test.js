import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ForumUserActivity from './forumUserActivities.model.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await ForumUserActivity.deleteMany({});
});

describe('ForumUserActivity Model', () => {
  const getValidActivityData = () => ({
    userId: new mongoose.Types.ObjectId(),
    workspaceId: new mongoose.Types.ObjectId(),
    organizationId: new mongoose.Types.ObjectId(),
    forumPostId: new mongoose.Types.ObjectId(),
  });

  describe('Schema and Basic Validations', () => {
    it('should create and save a valid "like" activity successfully', async () => {
      const validData = { ...getValidActivityData(), like: true };
      const activity = new ForumUserActivity(validData);
      const savedActivity = await activity.save();

      expect(savedActivity._id).toBeDefined();
      expect(savedActivity.userId).toEqual(validData.userId);
      expect(savedActivity.workspaceId).toEqual(validData.workspaceId);
      expect(savedActivity.organizationId).toEqual(validData.organizationId);
      expect(savedActivity.forumPostId).toEqual(validData.forumPostId);
      expect(savedActivity.like).toBe(true);
      expect(savedActivity.comment).toBeUndefined();
      expect(savedActivity.createdAt).toBeDefined();
      expect(savedActivity.updatedAt).toBeDefined();
    });

    it('should create and save a valid "comment" activity successfully', async () => {
      const validData = { ...getValidActivityData(), comment: 'This is a test comment.' };
      const activity = new ForumUserActivity(validData);
      const savedActivity = await activity.save();

      expect(savedActivity._id).toBeDefined();
      expect(savedActivity.comment).toBe('This is a test comment.');
      expect(savedActivity.like).toBe(false); // Should default to false
    });

    it('should create and save an activity that is both a like and a comment', async () => {
        const validData = { ...getValidActivityData(), like: true, comment: 'I like this!' };
        const activity = new ForumUserActivity(validData);
        const savedActivity = await activity.save();
  
        expect(savedActivity._id).toBeDefined();
        expect(savedActivity.like).toBe(true);
        expect(savedActivity.comment).toBe('I like this!');
      });

    it('should fail if required fields are missing', async () => {
      const activity = new ForumUserActivity({});
      let error;
      try {
        await activity.save();
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(error.errors.userId).toBeDefined();
      expect(error.errors.workspaceId).toBeDefined();
      expect(error.errors.organizationId).toBeDefined();
      expect(error.errors.forumPostId).toBeDefined();
    });

    it('should trim whitespace from comments', async () => {
      const validData = { ...getValidActivityData(), comment: '  leading and trailing whitespace  ' };
      const activity = new ForumUserActivity(validData);
      const savedActivity = await activity.save();
      expect(savedActivity.comment).toBe('leading and trailing whitespace');
    });

    it('should fail if comment is too long', async () => {
        const longComment = 'a'.repeat(1001);
        const activity = new ForumUserActivity({ ...getValidActivityData(), comment: longComment });
        await expect(activity.save()).rejects.toThrow('Comment is too large');
    });
  });

  describe('Context Boundary Enforcement', () => {
    it('should require a userId to associate the activity with a user', async () => {
        const data = getValidActivityData();
        delete data.userId;
        const activity = new ForumUserActivity(data);
        await expect(activity.save()).rejects.toThrow('User is required');
    });

    it('should require a workspaceId to enforce tenant boundaries', async () => {
        const data = getValidActivityData();
        delete data.workspaceId;
        const activity = new ForumUserActivity(data);
        await expect(activity.save()).rejects.toThrow('Workspace is required');
    });

    it('should require an organizationId to enforce top-level tenant context', async () => {
        const data = getValidActivityData();
        delete data.organizationId;
        const activity = new ForumUserActivity(data);
        await expect(activity.save()).rejects.toThrow('Organization is required');
    });
  });

  describe('Pre-save Hook Logic', () => {
    it('should fail to save if activity is not a like and has no comment', async () => {
      const invalidData = { ...getValidActivityData(), like: false, comment: '' };
      const activity = new ForumUserActivity(invalidData);
      await expect(activity.save()).rejects.toThrow('Activity must be a like or have a comment.');
    });

    it('should fail to save if like is false and comment is just whitespace', async () => {
        const invalidData = { ...getValidActivityData(), like: false, comment: '   ' };
        const activity = new ForumUserActivity(invalidData);
        // The trim:true and minLength:1 validator will catch this before the pre-save hook
        await expect(activity.save()).rejects.toThrow('Comment cannot be empty.');
    });

    it('should fail to save if like is default (false) and comment is missing', async () => {
        const invalidData = getValidActivityData(); // like defaults to false, no comment
        const activity = new ForumUserActivity(invalidData);
        await expect(activity.save()).rejects.toThrow('Activity must be a like or have a comment.');
    });
  });

  describe('Indexes', () => {
    describe('Unique Like Index (forumPostId, userId, like)', () => {
        const commonData = getValidActivityData();
        const { userId, forumPostId } = commonData;

        it('should prevent a user from liking the same post more than once', async () => {
            // First like
            const firstLike = new ForumUserActivity({ ...commonData, like: true });
            await firstLike.save();

            // Second like (should fail)
            const secondLike = new ForumUserActivity({ ...commonData, like: true });
            await expect(secondLike.save()).rejects.toThrow('E11000 duplicate key error');
        });

        it('should allow a user to comment on a post they have already liked', async () => {
            // First like
            const like = new ForumUserActivity({ ...commonData, like: true });
            await like.save();

            // Then comment (should succeed)
            const comment = new ForumUserActivity({ ...commonData, comment: 'My first comment!' });
            const savedComment = await comment.save();
            expect(savedComment._id).toBeDefined();
        });

        it('should allow a user to add multiple comments to the same post', async () => {
            const firstComment = new ForumUserActivity({ ...commonData, comment: 'First!' });
            await firstComment.save();

            const secondComment = new ForumUserActivity({ ...commonData, comment: 'Second!' });
            const savedSecondComment = await secondComment.save();
            expect(savedSecondComment._id).toBeDefined();
        });

        it('should allow a different user to like the same post', async () => {
            const firstUserLike = new ForumUserActivity({ ...commonData, like: true });
            await firstUserLike.save();

            const secondUserData = { ...commonData, userId: new mongoose.Types.ObjectId() };
            const secondUserLike = new ForumUserActivity({ ...secondUserData, like: true });
            const savedSecondLike = await secondUserLike.save();
            expect(savedSecondLike._id).toBeDefined();
        });

        it('should allow the same user to like a different post', async () => {
            const firstPostLike = new ForumUserActivity({ ...commonData, like: true });
            await firstPostLike.save();

            const secondPostData = { ...commonData, forumPostId: new mongoose.Types.ObjectId() };
            const secondPostLike = new ForumUserActivity({ ...secondPostData, like: true });
            const savedSecondLike = await secondPostLike.save();
            expect(savedSecondLike._id).toBeDefined();
        });
    });
  });
});