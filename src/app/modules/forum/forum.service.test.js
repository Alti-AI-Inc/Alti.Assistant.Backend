import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getForumService,
  addForumServices,
  getForumServiceById,
  getForumServiceByEmail,
  updateForumService,
  deleteForumService,
  getForumSuggestionService,
  addUserForumActivityServices,
  getCommentService,
  deleteCommentServices,
} from './forum.service';
import Forum from './forum.model';
import UserForumActivities from './forumUserActivities.model';
import paginationHelpers from '../../helpers/paginationHelpers';
import { withTenantContext, withTenantFilter } from '../../helpers/tenantQuery';

// Mock dependencies
vi.mock('./forum.model');
vi.mock('./forumUserActivities.model');
vi.mock('../../helpers/paginationHelpers');
vi.mock('../../helpers/tenantQuery');

// Mock request object for tenant context testing
const mockReq = {
  user: {
    tenantId: 'tenant-123',
    // Note: Role-based access is not checked in this service layer.
    // It's assumed to be handled by controllers or middleware.
    // We are only testing the tenant context boundary here.
    role: 'user',
  },
};

const mockTenantQuery = (query) => ({ ...query, tenantId: 'tenant-123' });
const mockTenantData = (data) => ({ ...data, tenantId: 'tenant-123' });

describe('Forum Service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    withTenantFilter.mockImplementation((req, query) => mockTenantQuery(query));
    withTenantContext.mockImplementation((req, data) => mockTenantData(data));
  });

  describe('getForumService', () => {
    const mockForumData = [{ _id: '1', title: 'Test Forum' }];
    const mockPaginationResult = {
      page: 1,
      limit: 10,
      skip: 0,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    };

    const mockForumQueryChain = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockForumData),
    };

    beforeEach(() => {
      paginationHelpers.calculatePagination.mockReturnValue(mockPaginationResult);
      Forum.find.mockReturnValue(mockForumQueryChain);
      Forum.countDocuments.mockResolvedValue(1);
    });

    it('should retrieve forums with pagination and tenant context', async () => {
      const filters = {};
      const paginationOptions = { page: 1, limit: 10 };

      const result = await getForumService(filters, paginationOptions, mockReq);

      expect(paginationHelpers.calculatePagination).toHaveBeenCalledWith(paginationOptions);
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, {});
      expect(Forum.find).toHaveBeenCalledWith(mockTenantQuery({}));
      expect(mockForumQueryChain.sort).toHaveBeenCalledWith({ createdAt: 'desc' });
      expect(mockForumQueryChain.skip).toHaveBeenCalledWith(0);
      expect(mockForumQueryChain.limit).toHaveBeenCalledWith(10);
      expect(mockForumQueryChain.lean).toHaveBeenCalled();
      expect(Forum.countDocuments).toHaveBeenCalledWith(mockTenantQuery({}));
      expect(result).toEqual({
        meta: { page: 1, limit: 10, total: 1 },
        data: mockForumData,
      });
    });

    it('should handle search term correctly', async () => {
      const filters = { searchTerm: 'test' };
      const paginationOptions = {};
      const expectedQuery = {
        $and: [
          {
            $or: [
              { title: { $regex: 'test', $options: 'i' } },
              { category: { $regex: 'test', $options: 'i' } },
            ],
          },
        ],
      };

      await getForumService(filters, paginationOptions, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, expectedQuery);
      expect(Forum.find).toHaveBeenCalledWith(mockTenantQuery(expectedQuery));
      expect(Forum.countDocuments).toHaveBeenCalledWith(mockTenantQuery(expectedQuery));
    });

    it('should handle filter data correctly', async () => {
        const filters = { filtersData: { category: 'tech' } };
        const paginationOptions = {};
        const expectedQuery = {
            $and: [
                {
                    $and: [{ category: 'tech' }],
                },
            ],
        };

        await getForumService(filters, paginationOptions, null); // No tenant context

        expect(withTenantFilter).not.toHaveBeenCalled();
        expect(Forum.find).toHaveBeenCalledWith(expectedQuery);
        expect(Forum.countDocuments).toHaveBeenCalledWith(expectedQuery);
    });

    it('should work without a request object (no tenant context)', async () => {
      const filters = {};
      const paginationOptions = {};

      await getForumService(filters, paginationOptions, null);

      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(Forum.find).toHaveBeenCalledWith({});
      expect(Forum.countDocuments).toHaveBeenCalledWith({});
    });
  });

  describe('addForumServices', () => {
    it('should create a forum with tenant context', async () => {
      const forumData = { title: 'New Forum', content: 'Content' };
      const expectedData = { ...forumData, tenantId: 'tenant-123' };
      Forum.create.mockResolvedValue(expectedData);

      const result = await addForumServices(forumData, mockReq);

      expect(withTenantContext).toHaveBeenCalledWith(mockReq, forumData);
      expect(Forum.create).toHaveBeenCalledWith(expectedData);
      expect(result).toEqual(expectedData);
    });

    it('should create a forum without tenant context', async () => {
      const forumData = { title: 'New Forum', content: 'Content' };
      Forum.create.mockResolvedValue(forumData);

      const result = await addForumServices(forumData, null);

      expect(withTenantContext).not.toHaveBeenCalled();
      expect(Forum.create).toHaveBeenCalledWith(forumData);
      expect(result).toEqual(forumData);
    });
  });

  describe('getForumServiceById', () => {
    const mockForum = { _id: 'forum-1', title: 'Found Forum' };
    const mockFindOneChain = {
        lean: vi.fn().mockResolvedValue(mockForum)
    };

    beforeEach(() => {
        Forum.findOne.mockReturnValue(mockFindOneChain);
    });

    it('should get a forum by ID with tenant context', async () => {
      const id = 'forum-1';
      const expectedQuery = { _id: id };

      const result = await getForumServiceById(id, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, expectedQuery);
      expect(Forum.findOne).toHaveBeenCalledWith(mockTenantQuery(expectedQuery));
      expect(mockFindOneChain.lean).toHaveBeenCalled();
      expect(result).toEqual(mockForum);
    });

    it('should get a forum by ID without tenant context', async () => {
      const id = 'forum-1';
      const expectedQuery = { _id: id };

      const result = await getForumServiceById(id, null);

      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(Forum.findOne).toHaveBeenCalledWith(expectedQuery);
      expect(result).toEqual(mockForum);
    });
  });

  describe('getForumServiceByEmail', () => {
    const mockForums = [{ _id: 'forum-1', authorEmail: 'test@example.com' }];
    const mockFindChain = {
        lean: vi.fn().mockResolvedValue(mockForums)
    };

    beforeEach(() => {
        Forum.find.mockReturnValue(mockFindChain);
    });

    it('should get forums by email with tenant context', async () => {
      const email = 'test@example.com';
      const expectedQuery = { authorEmail: email };

      const result = await getForumServiceByEmail(email, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, expectedQuery);
      expect(Forum.find).toHaveBeenCalledWith(mockTenantQuery(expectedQuery));
      expect(mockFindChain.lean).toHaveBeenCalled();
      expect(result).toEqual(mockForums);
    });

    it('should get forums by email without tenant context', async () => {
      const email = 'test@example.com';
      const expectedQuery = { authorEmail: email };

      const result = await getForumServiceByEmail(email, null);

      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(Forum.find).toHaveBeenCalledWith(expectedQuery);
      expect(result).toEqual(mockForums);
    });
  });

  describe('updateForumService', () => {
    it('should update a forum with tenant context', async () => {
      const id = 'forum-1';
      const data = { title: 'Updated Title' };
      const expectedQuery = { _id: id };
      const updateResult = { modifiedCount: 1 };
      Forum.updateOne.mockResolvedValue(updateResult);

      const result = await updateForumService(id, data, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, expectedQuery);
      expect(Forum.updateOne).toHaveBeenCalledWith(
        mockTenantQuery(expectedQuery),
        { $set: data },
        { runValidators: true }
      );
      expect(result).toEqual(updateResult);
    });

    it('should update a forum without tenant context', async () => {
      const id = 'forum-1';
      const data = { title: 'Updated Title' };
      const expectedQuery = { _id: id };
      const updateResult = { modifiedCount: 1 };
      Forum.updateOne.mockResolvedValue(updateResult);

      const result = await updateForumService(id, data, null);

      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(Forum.updateOne).toHaveBeenCalledWith(
        expectedQuery,
        { $set: data },
        { runValidators: true }
      );
      expect(result).toEqual(updateResult);
    });
  });

  describe('deleteForumService', () => {
    it('should delete a forum with tenant context', async () => {
      const id = 'forum-1';
      const expectedQuery = { _id: id };
      const deleteResult = { deletedCount: 1 };
      Forum.deleteOne.mockResolvedValue(deleteResult);

      const result = await deleteForumService(id, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, expectedQuery);
      expect(Forum.deleteOne).toHaveBeenCalledWith(mockTenantQuery(expectedQuery));
      expect(result).toEqual(deleteResult);
    });

    it('should delete a forum without tenant context', async () => {
      const id = 'forum-1';
      const expectedQuery = { _id: id };
      const deleteResult = { deletedCount: 1 };
      Forum.deleteOne.mockResolvedValue(deleteResult);

      const result = await deleteForumService(id, null);

      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(Forum.deleteOne).toHaveBeenCalledWith(expectedQuery);
      expect(result).toEqual(deleteResult);
    });
  });

  describe('getForumSuggestionService', () => {
    const mockSuggestions = [{ _id: '1', title: 'Suggestion 1' }];
    const mockFindChain = {
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockSuggestions)
    };

    beforeEach(() => {
        Forum.find.mockReturnValue(mockFindChain);
    });

    it('should get suggestions with tenant context', async () => {
      const categoryName = 'tech';
      const expectedQuery = { category: categoryName };

      const result = await getForumSuggestionService(categoryName, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, expectedQuery);
      expect(Forum.find).toHaveBeenCalledWith(mockTenantQuery(expectedQuery));
      expect(mockFindChain.limit).toHaveBeenCalledWith(3);
      expect(mockFindChain.lean).toHaveBeenCalled();
      expect(result).toEqual(mockSuggestions);
    });

    it('should get suggestions without tenant context', async () => {
      const categoryName = 'tech';
      const expectedQuery = { category: categoryName };

      const result = await getForumSuggestionService(categoryName, null);

      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(Forum.find).toHaveBeenCalledWith(expectedQuery);
      expect(mockFindChain.limit).toHaveBeenCalledWith(3);
      expect(result).toEqual(mockSuggestions);
    });
  });

  describe('addUserForumActivityServices', () => {
    it('should create an activity with tenant context', async () => {
      const activityData = { comment: 'Great post!' };
      const expectedData = { ...activityData, tenantId: 'tenant-123' };
      UserForumActivities.create.mockResolvedValue(expectedData);

      const result = await addUserForumActivityServices(activityData, mockReq);

      expect(withTenantContext).toHaveBeenCalledWith(mockReq, activityData);
      expect(UserForumActivities.create).toHaveBeenCalledWith(expectedData);
      expect(result).toEqual(expectedData);
    });

    it('should create an activity without tenant context', async () => {
      const activityData = { comment: 'Great post!' };
      UserForumActivities.create.mockResolvedValue(activityData);

      const result = await addUserForumActivityServices(activityData, null);

      expect(withTenantContext).not.toHaveBeenCalled();
      expect(UserForumActivities.create).toHaveBeenCalledWith(activityData);
      expect(result).toEqual(activityData);
    });
  });

  describe('getCommentService', () => {
    const mockComment = [{ _id: 'comment-1', text: 'A comment' }];
    const mockFindChain = {
        lean: vi.fn().mockResolvedValue(mockComment)
    };

    beforeEach(() => {
        UserForumActivities.find.mockReturnValue(mockFindChain);
    });

    it('should get a comment by ID with tenant context', async () => {
      const commentId = 'comment-1';
      const expectedQuery = { _id: commentId };

      const result = await getCommentService(commentId, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, expectedQuery);
      expect(UserForumActivities.find).toHaveBeenCalledWith(mockTenantQuery(expectedQuery));
      expect(mockFindChain.lean).toHaveBeenCalled();
      expect(result).toEqual(mockComment);
    });

    it('should get a comment by ID without tenant context', async () => {
      const commentId = 'comment-1';
      const expectedQuery = { _id: commentId };

      const result = await getCommentService(commentId, null);

      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(UserForumActivities.find).toHaveBeenCalledWith(expectedQuery);
      expect(result).toEqual(mockComment);
    });
  });

  describe('deleteCommentServices', () => {
    it('should delete a comment with tenant context', async () => {
      const id = 'comment-1';
      const expectedQuery = { _id: id };
      const deleteResult = { deletedCount: 1 };
      UserForumActivities.deleteOne.mockResolvedValue(deleteResult);

      const result = await deleteCommentServices(id, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, expectedQuery);
      expect(UserForumActivities.deleteOne).toHaveBeenCalledWith(mockTenantQuery(expectedQuery));
      expect(result).toEqual(deleteResult);
    });

    it('should delete a comment without tenant context', async () => {
      const id = 'comment-1';
      const expectedQuery = { _id: id };
      const deleteResult = { deletedCount: 1 };
      UserForumActivities.deleteOne.mockResolvedValue(deleteResult);

      const result = await deleteCommentServices(id, null);

      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(UserForumActivities.deleteOne).toHaveBeenCalledWith(expectedQuery);
      expect(result).toEqual(deleteResult);
    });
  });
});