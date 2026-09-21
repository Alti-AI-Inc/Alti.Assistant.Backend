import mongoose from 'mongoose';

/**
 * Invoice Model — tracks every billing event for users and sponsored members.
 *
 * Invoices are created automatically:
 * 1. On Stripe invoice.payment_succeeded webhook → real Stripe invoice
 * 2. On sponsored member plan assignment/change → internal invoice
 * 3. Monthly for active subscriptions → recurring invoice
 */
const InvoiceSchema = new mongoose.Schema(
  {
    // Who this invoice belongs to
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Who paid for this invoice (null = self-paid, set = sponsor paid)
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    // Stripe invoice ID (null for internal/sponsored invoices)
    stripeInvoiceId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    // Invoice number (auto-generated: INV-YYYYMM-XXXX)
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Invoice type
    type: {
      type: String,
      enum: ['subscription', 'one_time', 'sponsored', 'refund', 'credit'],
      default: 'subscription',
    },
    // Status
    status: {
      type: String,
      enum: ['paid', 'pending', 'failed', 'refunded', 'void'],
      default: 'paid',
      index: true,
    },
    // Plan details
    plan: {
      type: String,
      required: true,
    },
    planName: {
      type: String,
      required: true,
    },
    // Amounts (in cents)
    amount: {
      type: Number,
      required: true,
      default: 0,
    },
    currency: {
      type: String,
      default: 'usd',
    },
    // Billing period
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    // Line items
    lineItems: [
      {
        description: { type: String },
        quantity: { type: Number, default: 1 },
        unitAmount: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
      },
    ],
    // Payment details
    paymentMethod: {
      type: String, // 'stripe', 'sponsored', 'free'
      default: 'stripe',
    },
    stripePaymentIntentId: {
      type: String,
      default: null,
    },
    // Stripe hosted invoice URL (for Stripe-generated invoices)
    hostedInvoiceUrl: {
      type: String,
      default: null,
    },
    invoicePdf: {
      type: String,
      default: null,
    },
    // Member who was billed (for sponsor invoices)
    memberEmail: {
      type: String,
      default: null,
    },
    // Notes
    description: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for efficient queries
InvoiceSchema.index({ userId: 1, createdAt: -1 });
InvoiceSchema.index({ paidBy: 1, createdAt: -1 });
InvoiceSchema.index({ userId: 1, status: 1 });

/**
 * Generate next invoice number: INV-YYYYMM-XXXX
 */
InvoiceSchema.statics.generateInvoiceNumber = async function () {
  const now = new Date();
  const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const lastInvoice = await this.findOne({
    invoiceNumber: { $regex: `^${prefix}` },
  })
    .sort({ invoiceNumber: -1 })
    .lean();

  let seq = 1;
  if (lastInvoice) {
    const lastSeq = parseInt(lastInvoice.invoiceNumber.split('-').pop(), 10);
    seq = (lastSeq || 0) + 1;
  }

  return `${prefix}-${String(seq).padStart(4, '0')}`;
};

/**
 * Find all invoices for a user (self-paid + received as sponsored)
 */
InvoiceSchema.statics.findByUser = async function (userId, options = {}) {
  const { page = 1, limit = 20, status } = options;
  const query = { userId };
  if (status) query.status = status;

  const [invoices, total] = await Promise.all([
    this.find(query)
      .populate('paidBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    this.countDocuments(query),
  ]);

  return {
    invoices,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Find all invoices paid by a sponsor (for their team members)
 */
InvoiceSchema.statics.findByPayer = async function (payerId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const query = { paidBy: payerId };

  const [invoices, total] = await Promise.all([
    this.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    this.countDocuments(query),
  ]);

  return {
    invoices,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const Invoice = mongoose.model('Invoice', InvoiceSchema);
export default Invoice;
