/**
 * @file Defines the Mongoose schema and model for Notification documents.
 * @module app/modules/notification/notification.model
 * @author Your Name/Organization
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} NotificationSchema
 * @property {string} title - The title of the notification. Required.
 * @property {string} description - The detailed description of the notification. Required.
 * @property {boolean} [isRead=false] - Indicates if the notification has been read by the user.
 * @property {string} [link] - An optional URL link associated with the notification.
 * @property {'default'|'request'} [type='default'] - The type of notification, e.g., 'default' or 'request'.
 * @property {string} [category] - The category of the notification (e.g., 'system', 'chat', 'promotion').
 * @property {mongoose.Types.ObjectId} [userId] - The ID of the user to whom the notification is directed. References the 'User' model.
 * @property {boolean} [isArchived=false] - Indicates if the notification has been archived by the user.
 * @property {Map<string, any>} [payload={}] - A flexible map to store additional arbitrary data related to the notification.
 * @property {mongoose.Types.ObjectId} [tenantId=null] - The ID of the tenant this notification belongs to, for multi-tenancy. References the 'Tenant' model.
 * @property {Date} [createdAt] - The timestamp when the notification was created.
 * @property {Date} [updatedAt] - The timestamp when the notification was last updated.
 */

/**
 * Mongoose schema for the Notification model.
 * Defines the structure and validation rules for notification documents in MongoDB.
 *
 * @type {mongoose.Schema<NotificationSchema>}
 */
const notificationSchema = new mongoose.Schema(
  {
    /**
     * The title of the notification.
     * @type {string}
     * @required
     * @trim
     */
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
    },
    /**
     * The detailed description of the notification.
     * @type {string}
     * @required
     * @trim
     */
    description: {
      type: String,
      required: [true, 'Notification description is required'],
      trim: true,
    },
    /**
     * Indicates if the notification has been read by the user.
     * @type {boolean}
     * @default false
     */
    isRead: {
      type: Boolean,
      default: false,
    },
    /**
     * An optional URL link associated with the notification.
     * @type {string}
     * @trim
     */
    link: {
      type: String,
      trim: true,
    },
    /**
     * The type of notification.
     * @type {'default'|'request'}
     * @enum ['default', 'request']
     * @default 'default'
     */
    type: {
      type: String,
      enum: ['default', 'request'],
      default: 'default',
    },
    /**
     * The category of the notification.
     * @type {string}
     * @example 'system', 'chat', 'promotion', 'transaction', 'Event', 'Support', 'Warning', 'Alert'
     */
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
    /**
     * The ID of the user to whom the notification is directed.
     * References the 'User' model.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref 'User'
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    /**
     * Indicates if the notification has been archived by the user.
     * @type {boolean}
     * @default false
     */
    isArchived: {
      type: Boolean,
      default: false,
    },
    /**
     * A flexible map to store additional arbitrary data related to the notification.
     * @type {Map<string, any>}
     * @default {}
     */
    payload: {
      type: mongoose.Schema.Types.Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /**
     * The ID of the tenant this notification belongs to, for multi-tenancy support.
     * References the 'Tenant' model.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref 'Tenant'
     * @default null
     * @index
     */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
  },
  {
    /**
     * Mongoose timestamps option.
     * Adds `createdAt` and `updatedAt` fields to the schema.
     * @type {boolean}
     */
    timestamps: true,
  }
);

/**
 * Mongoose model for Notification.
 * Provides an interface to interact with the 'notifications' collection in MongoDB.
 *
 * @type {mongoose.Model<NotificationSchema>}
 */
const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;