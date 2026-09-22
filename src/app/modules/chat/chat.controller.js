import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import { ChatAiService } from './chat.service.js';
import Chat from './chat.model.js';

import { SovereignRouterService } from '../orchestrator/sovereignRouter.service.js';

// ── Send Chat Message (existing) ─────────────────────────────────────────────
const ChatAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } =
    await validatePromptRequest(req);

  const userContext = {
    timezone: req.body.timezone || 'America/New_York',
    localDate: req.body.localDate,
    localTime: req.body.localTime,
    category: req.body.category,
    metadata: req.body.metadata,
  };

  // If client requested stream or sent text/event-stream accept header
  if (req.body.stream === true || req.headers.accept?.includes('text/event-stream')) {
    return SovereignRouterService.handlePromptStream({
      prompt,
      sessionId,
      userId,
      userContext,
      res,
    });
  }

  const result = await ChatAiService.chatService(sessionId, prompt, userId, userContext);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

// ── List Chat Sessions (sidebar) ─────────────────────────────────────────────
const listSessions = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const skip = (page - 1) * limit;

  const [sessions, total] = await Promise.all([
    Chat.find({ user: userId })
      .select('sessionId title createdAt updatedAt responses')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .then(docs => docs.map(doc => ({
        _id: doc._id,
        sessionId: doc.sessionId,
        title: doc.title || doc.responses?.[0]?.prompt?.substring(0, 80) || 'New Chat',
        messageCount: doc.responses?.length || 0,
        lastMessage: doc.responses?.length
          ? doc.responses[doc.responses.length - 1].prompt?.substring(0, 100)
          : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }))),
    Chat.countDocuments({ user: userId }),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chat sessions retrieved',
    data: {
      sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + sessions.length < total,
      },
    },
  });
});

// ── Get Full Session (load conversation) ─────────────────────────────────────
const getSession = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { sessionId } = req.params;

  const session = await Chat.findOne({ user: userId, sessionId }).lean();

  if (!session) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Chat session not found',
      data: null,
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chat session retrieved',
    data: {
      _id: session._id,
      sessionId: session.sessionId,
      title: session.title,
      messageCount: session.responses?.length || 0,
      messages: session.responses?.map((r, i) => ({
        id: i,
        role: 'user',
        content: r.prompt,
        timestamp: r.createdAt || session.createdAt,
        model: r.model,
        reply: {
          role: 'assistant',
          content: r.reply,
          model: r.model,
          searchResults: r.search_results || [],
          totalTime: r.total_time,
        },
      })) || [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
  });
});

// ── Rename Session ───────────────────────────────────────────────────────────
const renameSession = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { sessionId } = req.params;
  const { title } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Title is required',
      data: null,
    });
  }

  const session = await Chat.findOneAndUpdate(
    { user: userId, sessionId },
    { title: title.trim().substring(0, 120) },
    { new: true }
  );

  if (!session) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Chat session not found',
      data: null,
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Session renamed',
    data: { sessionId, title: session.title },
  });
});

// ── Delete Session ───────────────────────────────────────────────────────────
const deleteSession = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { sessionId } = req.params;

  const result = await Chat.findOneAndDelete({ user: userId, sessionId });

  if (!result) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Chat session not found',
      data: null,
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chat session deleted',
    data: { sessionId },
  });
});

// ── Delete All Sessions ──────────────────────────────────────────────────────
const deleteAllSessions = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const result = await Chat.deleteMany({ user: userId });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Deleted ${result.deletedCount} chat sessions`,
    data: { deletedCount: result.deletedCount },
  });
});

// ── Search Chat History ──────────────────────────────────────────────────────
const searchHistory = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Search query must be at least 2 characters',
      data: null,
    });
  }

  const sessions = await Chat.find({
    user: userId,
    $or: [
      { title: { $regex: q, $options: 'i' } },
      { 'responses.prompt': { $regex: q, $options: 'i' } },
      { 'responses.reply': { $regex: q, $options: 'i' } },
    ],
  })
    .select('sessionId title createdAt updatedAt responses')
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean()
    .then(docs => docs.map(doc => ({
      _id: doc._id,
      sessionId: doc.sessionId,
      title: doc.title,
      messageCount: doc.responses?.length || 0,
      // Find first matching message for context
      matchedMessage: doc.responses?.find(r =>
        r.prompt?.toLowerCase().includes(q.toLowerCase()) ||
        r.reply?.toLowerCase().includes(q.toLowerCase())
      )?.prompt?.substring(0, 120),
      updatedAt: doc.updatedAt,
    })));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Found ${sessions.length} matching sessions`,
    data: sessions,
  });
});

// ── Export Session ────────────────────────────────────────────────────────────
const exportSession = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { sessionId } = req.params;
  const format = req.query.format || 'json';

  const session = await Chat.findOne({ user: userId, sessionId }).lean();

  if (!session) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Chat session not found',
      data: null,
    });
  }

  if (format === 'markdown') {
    let md = `# ${session.title}\n\n`;
    md += `*Session: ${session.sessionId} | Created: ${session.createdAt}*\n\n---\n\n`;
    for (const r of session.responses || []) {
      md += `**You:** ${r.prompt}\n\n`;
      md += `**Assistant:** ${r.reply}\n\n---\n\n`;
    }
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="chat-${sessionId}.md"`);
    return res.send(md);
  }

  // Default: JSON
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Session exported',
    data: {
      sessionId: session.sessionId,
      title: session.title,
      messages: session.responses?.map(r => ({
        role: 'user',
        content: r.prompt,
        reply: r.reply,
        model: r.model,
        searchResults: r.search_results || [],
      })) || [],
      exportedAt: new Date().toISOString(),
    },
  });
});

export const ChatAiController = {
  ChatAiGetResponse,
  GeminiAiGetResponse: ChatAiGetResponse,
  listSessions,
  getSession,
  renameSession,
  deleteSession,
  deleteAllSessions,
  searchHistory,
  exportSession,
};

export const GeminiAiController = ChatAiController;

export default ChatAiController;
