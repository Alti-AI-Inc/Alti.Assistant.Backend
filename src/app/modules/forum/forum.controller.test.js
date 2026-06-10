import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as forumController from '../../../src/app/modules/forum/forum.controller';
import {
  addForumServices,
  getForumService,
  getForumServiceById,
  getForumServiceByEmail,
  updateForumService,
  deleteForumService,
  getForumSuggestionService,
  addUserForumActivityServices,
  getCommnetService,
  deleteCommentServices,
} from '../../../src/app/modules/forum/forum.service';
import pick from '../../../src/app/middlewares/other/pick';
import { paginationFields } from '../../../src/app/modules/forum/forum.constant';

vi.mock('../../../src/app/modules/forum/forum.service');
vi.mock('../../../src/app/middlewares/other/pick');
vi.mock('../../../src/app/modules/forum/forum.constant', () => ({
  paginationFields: ['page', 'limit', 'sortBy', 'sortOrder'],
}));

describe('Forum Controller', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      query: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
    global.logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('addForum', () => {
    it('should add a forum successfully and return 200', async () => {
      const forumData = { title: 'New Forum', content: 'Content' };
      req.body = forumData;
      const mockResult = { id: '1', ...forumData };
      addForumServices.mockResolvedValue(mockResult);

      await forumController.addForum(req, res, next);

      expect(addForumServices).toHaveBeenCalledWith(forumData);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Add Forum Successfully',
        data: mockResult,
      });
    });

    it('should return 400 if adding a forum fails', async () => {
      const error = new Error('Failed to add forum');
      req.body = { title: 'New Forum' };
      addForumServices.mockRejectedValue(error);

      await forumController.addForum(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        message: "Forum doesn't add successfully",
        error: error.message,
      });
    });
  });

  describe('getForum', () => {
    it('should get forums with filters and pagination successfully', async () => {
      req.query = { searchTerm: 'test', page: '1', limit: '10' };
      const mockFilters = { searchTerm: 'test' };
      const mockPagination = { page: 1, limit: 10 };
      const mockResult = { data: [], meta: {} };

      pick.mockImplementation((obj, keys) => {
        if (keys.includes('searchTerm')) return mockFilters;
        if (keys.includes('page')) return mockPagination;
        return {};
      });

      getForumService.mockResolvedValue(mockResult);

      await forumController.getForum(req, res);

      expect(pick).toHaveBeenCalledWith(req.query, ['searchTerm', 'title', 'category']);
      expect(pick).toHaveBeenCalledWith(req.query, paginationFields);
      expect(getForumService).toHaveBeenCalledWith(mockFilters, mockPagination);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Get Forums Successfully',
        data: mockResult,
      });
    });

    it('should return 400 if getting forums fails', async () => {
      const error = new Error('Failed to get forums');
      getForumService.mockRejectedValue(error);

      await forumController.getForum(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        message: "Couldn't get fourms successfully",
        error: error.message,
      });
    });
  });

  describe('getForumById', () => {
    it('should get a forum by ID successfully', async () => {
      const forumId = 'forum123';
      req.params.id = forumId;
      const mockResult = { id: forumId, title: 'Test Forum' };
      getForumServiceById.mockResolvedValue(mockResult);

      await forumController.getForumById(req, res);

      expect(getForumServiceById).toHaveBeenCalledWith(forumId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'Success',
        message: 'Get forum by id successfully',
        data: mockResult,
      });
    });

    it('should return 400 if getting forum by ID fails', async () => {
      const forumId = 'forum123';
      req.params.id = forumId;
      const error = new Error('Forum not found');
      getForumServiceById.mockRejectedValue(error);

      await forumController.getForumById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        message: "Couldn't not get forum by id",
        error: error.message,
      });
    });
  });

  describe('getForumByEmail', () => {
    it('should get forums by email successfully', async () => {
      const email = 'test@example.com';
      req.params.email = email;
      const mockResult = [{ id: '1', title: 'Forum by email' }];
      getForumServiceByEmail.mockResolvedValue(mockResult);

      await forumController.getForumByEmail(req, res);

      expect(getForumServiceByEmail).toHaveBeenCalledWith(email);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'Success',
        message: 'Get forum by email successfully',
        data: mockResult,
      });
    });

    it('should return 400 if getting forums by email fails', async () => {
      const email = 'test@example.com';
      req.params.email = email;
      const error = new Error('Failed to get forums by email');
      getForumServiceByEmail.mockRejectedValue(error);

      await forumController.getForumByEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        message: "Couldn't not get forum by email",
        error: error.message,
      });
    });
  });

  describe('updateForum', () => {
    it('should update a forum successfully', async () => {
      const forumId = 'forum123';
      const updateData = { title: 'Updated Title' };
      req.params.id = forumId;
      req.body = updateData;
      const mockResult = { id: forumId, ...updateData };
      updateForumService.mockResolvedValue(mockResult);

      await forumController.updateForum(req, res);

      expect(updateForumService).toHaveBeenCalledWith(forumId, updateData);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'Success',
        message: 'Forum Update Successfully',
        data: mockResult,
      });
    });

    it('should return 400 if updating a forum fails', async () => {
      const forumId = 'forum123';
      req.params.id = forumId;
      const error = new Error('Update failed');
      updateForumService.mockRejectedValue(error);

      await forumController.updateForum(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'Fail',
        message: "Forum couldn't Update Successfully",
        error: error.message,
      });
    });
  });

  describe('deleteForum', () => {
    it('should delete a forum successfully', async () => {
      const forumId = 'forum123';
      req.params.id = forumId;
      const mockResult = { deletedCount: 1 };
      deleteForumService.mockResolvedValue(mockResult);

      await forumController.deleteForum(req, res);

      expect(deleteForumService).toHaveBeenCalledWith(forumId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'Success',
        message: 'Forum Delete Successfully',
        data: mockResult,
      });
    });

    it('should return 400 if forum to delete is not found', async () => {
      const forumId = 'forum123';
      req.params.id = forumId;
      const mockResult = { deletedCount: 0 };
      deleteForumService.mockResolvedValue(mockResult);

      await forumController.deleteForum(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        error: "Could't delete the forum",
      });
    });

    it('should return 400 if deleting a forum fails', async () => {
      const forumId = 'forum123';
      req.params.id = forumId;
      const error = new Error('Delete failed');
      deleteForumService.mockRejectedValue(error);

      await forumController.deleteForum(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'Fail',
        message: "Forum couldn't Delete Successfully",
        error: error.message,
      });
    });
  });

  describe('getForumSuggestion', () => {
    it('should get forum suggestions successfully', async () => {
      const suggestionQuery = 'react';
      req.params.suggestion = suggestionQuery;
      const mockResult = [{ title: 'React Hooks' }];
      getForumSuggestionService.mockResolvedValue(mockResult);

      await forumController.getForumSuggestion(req, res);

      expect(getForumSuggestionService).toHaveBeenCalledWith(suggestionQuery);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Get Forums suggestion Successfully',
        data: mockResult,
      });
    });

    it('should return 400 if getting suggestions fails', async () => {
      const suggestionQuery = 'react';
      req.params.suggestion = suggestionQuery;
      const error = new Error('Failed to get suggestions');
      getForumSuggestionService.mockRejectedValue(error);

      await forumController.getForumSuggestion(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        message: "Couldn't get fourms suggestion",
        error: error.message,
      });
    });
  });

  describe('addUserForumActivity', () => {
    it('should add user forum activity successfully', async () => {
      const activityData = { userId: 'user1', forumId: 'forum1', type: 'like' };
      req.body = activityData;
      const mockResult = { id: 'activity1', ...activityData };
      addUserForumActivityServices.mockResolvedValue(mockResult);

      await forumController.addUserForumActivity(req, res, next);

      expect(addUserForumActivityServices).toHaveBeenCalledWith(activityData);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Successfully Added',
        data: mockResult,
      });
    });

    it('should return 400 if adding activity fails', async () => {
      const error = new Error('Failed to add activity');
      addUserForumActivityServices.mockRejectedValue(error);

      await forumController.addUserForumActivity(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        message: "Doesn't add comment",
        error: error.message,
      });
    });
  });

  describe('getComment', () => {
    it('should get a comment by ID successfully', async () => {
      const commentId = 'comment123';
      req.params.commentId = commentId;
      const mockResult = { id: commentId, text: 'A comment' };
      getCommnetService.mockResolvedValue(mockResult);

      await forumController.getComment(req, res);

      expect(getCommnetService).toHaveBeenCalledWith(commentId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Get Comment Successfully',
        data: mockResult,
      });
    });

    it('should return 400 if getting a comment fails', async () => {
      const commentId = 'comment123';
      req.params.commentId = commentId;
      const error = new Error('Comment not found');
      getCommnetService.mockRejectedValue(error);

      await forumController.getComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        message: "Couldn't get Comment successfully",
        error: error.message,
      });
    });
  });

  describe('deleteComment', () => {
    it('should delete a comment successfully', async () => {
      const commentId = 'comment123';
      req.params.id = commentId;
      const mockResult = { deletedCount: 1 };
      deleteCommentServices.mockResolvedValue(mockResult);

      await forumController.deleteComment(req, res);

      expect(deleteCommentServices).toHaveBeenCalledWith(commentId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'Success',
        message: 'Comment Delete Successfully',
        data: mockResult,
      });
    });

    it('should return 400 if comment to delete is not found', async () => {
      const commentId = 'comment123';
      req.params.id = commentId;
      const mockResult = { deletedCount: 0 };
      deleteCommentServices.mockResolvedValue(mockResult);

      await forumController.deleteComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        error: "Could't delete the Comment",
      });
    });

    it('should return 400 if deleting a comment fails', async () => {
      const commentId = 'comment123';
      req.params.id = commentId;
      const error = new Error('Delete failed');
      deleteCommentServices.mockRejectedValue(error);

      await forumController.deleteComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'Fail',
        message: "Blog couldn't Delete Successfully",
        error: error.message,
      });
    });
  });
});