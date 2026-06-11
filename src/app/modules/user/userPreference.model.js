import { Schema, model } from 'mongoose';

const userPreferenceSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    dismissedRecommendations: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const UserPreference = model('UserPreference', userPreferenceSchema);

export default UserPreference;
