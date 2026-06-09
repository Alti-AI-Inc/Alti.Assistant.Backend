const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * @file This file defines the Mongoose schema and model for the Admin entity.
 * @module models/admin
 * @requires mongoose
 */

/**
 * Mongoose schema for the Admin entity.
 * Represents an administrator user within the system, typically with elevated privileges.
 *
 * @typedef {object} AdminSchema
 * @property {string} username - The unique username of the administrator. Required.
 * @property {string} email - The unique email address of the administrator. Required.
 * @property {string} password - The hashed password of the administrator. Required.
 * @property {string} [firstName] - The first name of the administrator. Optional.
 * @property {string} [lastName] - The last name of the administrator. Optional.
 * @property {string[]} [roles] - An array of roles assigned to the administrator (e.g., 'superadmin', 'editor'). Defaults to ['admin'].
 * @property {boolean} [isActive] - Indicates if the administrator account is active. Defaults to true.
 * @property {Date} [createdAt] - The date and time when the administrator account was created. Automatically set.
 * @property {Date} [updatedAt] - The date and time when the administrator account was last updated. Automatically set.
 */
const adminSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/.+@.+\..+/, 'Please fill a valid email address']
    },
    password: {
        type: String,
        required: true
    },
    firstName: {
        type: String,
        trim: true
    },
    lastName: {
        type: String,
        trim: true
    },
    roles: {
        type: [String],
        enum: ['admin', 'superadmin', 'editor', 'viewer'], // Example roles
        default: ['admin']
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true // Adds createdAt and updatedAt fields automatically
});

/**
 * Mongoose model for the Admin entity.
 * Provides an interface for interacting with the 'admins' collection in the database.
 *
 * @type {mongoose.Model<AdminSchema>}
 * @alias Admin
 */
module.exports = mongoose.model('Admin', adminSchema);