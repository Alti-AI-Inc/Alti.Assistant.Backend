import { Schema, model } from 'mongoose';

const memberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['editor', 'viewer'], default: 'viewer' },
  },
  { _id: false }
);

const spaceSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Space name is required'],
      trim: true,
      maxlength: [120, 'Space name cannot exceed 120 characters'],
    },
    slug: { type: String, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    members: { type: [memberSchema], default: [] },
    isPrivate: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    searchCount: { type: Number, default: 0, min: 0 },
    searches: {
      type: [{ type: Schema.Types.ObjectId, ref: 'ExaSearch' }],
      default: [],
    },
    monitors: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Monitor' }],
      default: [],
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

spaceSchema.index({ owner: 1, slug: 1 }, { unique: true });
spaceSchema.index({ owner: 1, status: 1, createdAt: -1 });
spaceSchema.index({ name: 'text', description: 'text' });

spaceSchema.pre('save', function (next) {
  if (this.isModified('name') && !this.isModified('slug')) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
  next();
});

export const Space = model('Space', spaceSchema);
