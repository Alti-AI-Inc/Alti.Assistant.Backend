const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Security Patch: Import bcrypt for password hashing.
const Schema = mongoose.Schema;

/**
 * @file This file defines the Mongoose schema and model for the Admin entity.
 * @module models/admin
 * @requires mongoose
 * @requires bcryptjs
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
        // Security Note: Basic email regex is used. For production, consider a more robust validation library like 'validator'.
        match: [/.+@.+\..+/, 'Please fill a valid email address']
    },
    password: {
        type: String,
        required: true,
        select: false // Security Patch: Exclude password from query results by default to prevent accidental exposure.
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
        // Security Note: Enum provides strong input validation against a predefined list of roles.
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
 * Security Patch: Mongoose pre-save hook to automatically hash the password before saving.
 * This ensures that plain-text passwords are never stored in the database.
 */
adminSchema.pre('save', async function(next) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) {
        return next();
    }

    try {
        // Generate a salt and hash the password
        const salt = await bcrypt.genSalt(12); // Using a cost factor of 12 is a strong modern standard.
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

/**
 * Security Patch: Instance method to compare a candidate password with the stored hash.
 * This provides a safe and centralized way to verify passwords, abstracting the comparison logic.
 * @param {string} candidatePassword The password to compare.
 * @returns {Promise<boolean>} A promise that resolves to true if the passwords match, false otherwise.
 */
adminSchema.methods.comparePassword = async function(candidatePassword) {
    // Since the password field has `select: false`, it's not available on `this` by default.
    // A query explicitly selecting `+password` is needed before calling this method.
    return bcrypt.compare(candidatePassword, this.password);
};


// Compound index to optimize queries filtering active administrators by role (e.g., authorization checks)
adminSchema.index({ isActive: 1, roles: 1 });

// Index to optimize sorting administrators by creation date (common in admin dashboards/management panels)
adminSchema.index({ createdAt: -1 });

/**
 * Mongoose model for the Admin entity.
 * Provides an interface for interacting with the 'admins' collection in the database.
 *
 * @type {mongoose.Model<AdminSchema>}
 * @alias Admin
 */
module.exports = mongoose.model('Admin', adminSchema);