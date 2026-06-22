import mongoose from 'mongoose';

const platformConfigSchema = new mongoose.Schema(
  {
    service: {
      enabled: {
        type: Boolean,
        default: true,
      },
    },
    ai: {
      defaultModel: {
        type: String,
        default: 'gemini-3.5-flash',
      },
      temperature: {
        type: Number,
        default: 0.7,
      },
    },
    puppeteerOptions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const PlatformConfig = mongoose.models.PlatformConfig || mongoose.model('PlatformConfig', platformConfigSchema);

export default PlatformConfig;
