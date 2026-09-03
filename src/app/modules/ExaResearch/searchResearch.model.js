import { Schema, model } from 'mongoose';

const researchSessionSchema = new Schema(
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
    researches: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Exa-Research' }],
      default: [],
    },
    lastSearchAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

researchSessionSchema.index({ space: 1, updatedAt: -1 });

export const SearchSession = model(
  'ResearchSession',
  researchSessionSchema,
  'research-sessions'
);
