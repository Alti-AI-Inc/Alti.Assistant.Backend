import mongoose from 'mongoose';

const ChatbotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Chatbot name is required'],
      trim: true,
      maxlength: [100, 'Chatbot name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    instructions: {
      type: String,
      trim: true,
      default: '',
    },
    guardrails: {
      type: String,
      trim: true,
      default: '',
    },
    model: {
      type: String,
      default: 'Gemini 1.5 Pro',
    },
    avatar: {
      type: String,
      default: '🤖',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    knowledgebaseIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'KnowledgeBase',
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Indexes
ChatbotSchema.index({ userId: 1, isActive: 1 });

const Chatbot = mongoose.model('Chatbot', ChatbotSchema);

export default Chatbot;
