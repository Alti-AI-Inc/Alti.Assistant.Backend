import { Schema, model } from 'mongoose';

/**
 * A member is a user granted access to a space that they do not own.
 * Kept as a subdocument (no own _id) since it is always accessed
 * through its parent Space, never queried independently.
 */
const memberSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['editor', 'viewer'],
      default: 'viewer',
    },
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
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    members: {
      type: [memberSchema],
      default: [],
    },
    isPrivate: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    // Denormalized counter avoided per-request COUNT queries on ExaSearch.
    // Kept in sync by search.service.js on create/delete.
    searchCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// A user cannot have two spaces with the same slug — enforces per-owner
// uniqueness rather than global uniqueness, since spaces are user-isolated.
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