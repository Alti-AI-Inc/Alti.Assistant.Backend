import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Notification description is required'],
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    link: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['default', 'request'],
      default: 'default',
    },
    category: {
      type: String,
      // enum: [
      //   'system',
      //   'chat',
      //   'promotion',
      //   'transaction',
      //   'Event',
      //   'Support',
      //   'Warning',
      //   'Alert',
      // ],
      // default: 'system',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
  },
  {
    timestamps: true,
  },
);

// Create Model
const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
