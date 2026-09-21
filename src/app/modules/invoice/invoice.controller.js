import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import Invoice from './invoice.model.js';

// ── List My Invoices ─────────────────────────────────────────────────────────

/**
 * GET /api/v1/invoices
 * Returns invoices for the authenticated user.
 * Account owners also see invoices for their sponsored members.
 */
const listInvoices = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20, type } = req.query;

  const query = {
    $or: [
      { userId },      // My own invoices
      { paidBy: userId }, // Invoices I paid for my team
    ],
  };
  if (type) query.type = type;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .populate('userId', 'name email')
      .populate('paidBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Invoice.countDocuments(query),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invoices retrieved',
    data: {
      invoices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    },
  });
});

// ── Get Single Invoice ───────────────────────────────────────────────────────

/**
 * GET /api/v1/invoices/:invoiceId
 */
const getInvoice = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { invoiceId } = req.params;

  const invoice = await Invoice.findOne({
    _id: invoiceId,
    $or: [{ userId }, { paidBy: userId }],
  })
    .populate('userId', 'name email')
    .populate('paidBy', 'name email')
    .lean();

  if (!invoice) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Invoice not found',
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invoice retrieved',
    data: invoice,
  });
});

// ── Invoice Summary / Stats ──────────────────────────────────────────────────

/**
 * GET /api/v1/invoices/summary
 * Returns billing summary for the current user.
 */
const getInvoiceSummary = catchAsync(async (req, res) => {
  const userId = req.user._id;

  // Total spent (self-paid)
  const selfPaid = await Invoice.aggregate([
    { $match: { userId, paidBy: null, status: 'paid' } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);

  // Total spent on team members
  const teamPaid = await Invoice.aggregate([
    { $match: { paidBy: userId, status: 'paid' } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);

  // Recent invoices (last 3)
  const recentInvoices = await Invoice.find({
    $or: [{ userId }, { paidBy: userId }],
  })
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invoice summary',
    data: {
      selfPaid: {
        totalCents: selfPaid[0]?.total || 0,
        totalDollars: ((selfPaid[0]?.total || 0) / 100).toFixed(2),
        count: selfPaid[0]?.count || 0,
      },
      teamPaid: {
        totalCents: teamPaid[0]?.total || 0,
        totalDollars: ((teamPaid[0]?.total || 0) / 100).toFixed(2),
        count: teamPaid[0]?.count || 0,
      },
      recentInvoices,
    },
  });
});

export const invoiceController = {
  listInvoices,
  getInvoice,
  getInvoiceSummary,
};

export default invoiceController;
