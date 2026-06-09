/**
 * @file Defines the Mongoose schema and model for tracking processed Stripe events.
 * @module models/StripeEvent
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} StripeEvent
 * @property {string} eventId - The unique identifier for the Stripe event.
 * @property {Date} processedAt - The timestamp when the Stripe event was processed by the application.
 * @property {Date} createdAt - The timestamp when the document was created.
 * @property {Date} updatedAt - The timestamp when the document was last updated.
 */

/**
 * Mongoose Schema for a Stripe Event.
 * This schema is used to store unique identifiers of Stripe events that have been processed
 * by the application. This helps prevent duplicate processing of the same event.
 *
 * The `processedAt` field has a Time-To-Live (TTL) index, meaning documents will
 * automatically expire and be removed from the collection after 30 days.
 *
 * @type {mongoose.Schema<StripeEvent>}
 */
const StripeEventSchema = new mongoose.Schema(
  {
    /**
     * The unique identifier for the Stripe event (e.g., `evt_xxxxxxxxxxxxxx`).
     * This field is required, must be unique across the collection, and is indexed for efficient lookups.
     * @type {string}
     * @required
     * @unique
     * @index
     */
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /**
     * The timestamp indicating when this Stripe event was processed by the application.
     * Defaults to the current date and time.
     * This field has a TTL index set to 30 days (2592000 seconds), after which the document will automatically expire.
     * @type {Date}
     * @default Date.now
     * @expires 2592000 // 30 days TTL in seconds
     */
    processedAt: {
      type: Date,
      default: Date.now,
      expires: 2592000, // 30 days TTL in seconds
    },
  },
  {
    /**
     * Mongoose timestamps option.
     * If set to true, Mongoose adds `createdAt` and `updatedAt` properties to the schema.
     * @type {boolean}
     */
    timestamps: true,
  }
);

/**
 * Mongoose Model for a Stripe Event.
 * Provides an interface to the `stripeevents` collection in MongoDB, allowing for
 * CRUD operations and schema validation.
 *
 * @type {mongoose.Model<StripeEvent>}
 */
const StripeEvent = mongoose.model('StripeEvent', StripeEventSchema);

export default StripeEvent;