import { Schema, model } from 'mongoose';

const searchSessionSchema = new Schema(
  {
    space: {
      type: Schema.Types.ObjectId,
      ref: 'Space',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    searches: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Exa-Search' }],
      default: [],
    },
    lastSearchAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

searchSessionSchema.index({ space: 1, updatedAt: -1 });

export const SearchSession = model(
  'SearchSession',
  searchSessionSchema,
  'search-sessions'
);
