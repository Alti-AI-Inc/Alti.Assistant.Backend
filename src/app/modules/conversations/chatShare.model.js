import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const ChatShareSchema = new mongoose.Schema(
  {
    shareId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      ref: 'Conversation',
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    shareType: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    allowComments: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: null, // null means no expiration
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    lastViewedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for better query performance
ChatShareSchema.index({ userId: 1, isActive: 1 });
ChatShareSchema.index({ conversationId: 1, isActive: 1 });
ChatShareSchema.index({ expiresAt: 1 });
ChatShareSchema.index({ shareType: 1, isActive: 1 });

// Virtual to check if share has expired
ChatShareSchema.virtual('isExpired').get(function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// Instance method to increment view count
ChatShareSchema.methods.incrementViewCount = function () {
  this.viewCount += 1;
  this.lastViewedAt = new Date();
  return this.save();
};

// Instance method to check if share is accessible
ChatShareSchema.methods.isAccessible = function () {
  if (!this.isActive) return false;
  if (this.isExpired) return false;
  return true;
};

// Static method to find active share by shareId
ChatShareSchema.statics.findActiveShare = function (shareId) {
  return this.findOne({
    shareId,
    isActive: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  }).populate('conversationId');
};

// Static method to find user's shared chats
ChatShareSchema.statics.findUserShares = function (userId, options = {}) {
  const { page = 1, limit = 20, status = 'active' } = options;

  let query = { userId };

  if (status === 'active') {
    query.isActive = true;
    query.$or = [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ];
  } else if (status === 'expired') {
    query.expiresAt = { $lte: new Date() };
  } else if (status === 'revoked') {
    query.isActive = false;
  }

  const skip = (page - 1) * limit;

  return this.find(query)
    .populate('conversationId', 'title conversationId lastActivity messageCount')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Pre-save middleware to set default shareId if not provided
ChatShareSchema.pre('save', function (next) {
  if (!this.shareId) {
    this.shareId = uuidv4();
  }
  next();
});

const ChatShare = mongoose.model('ChatShare', ChatShareSchema);

export default ChatShare;