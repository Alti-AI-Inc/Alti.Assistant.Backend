const mongoose = require('mongoose');
const bcrypt =require('bcryptjs');
const crypto = require('crypto'); // Added for generating secure invitation tokens.
const Schema = mongoose.Schema;

/**
 * @file This file defines the Mongoose schema and model for the User entity.
 * @description This model supports a multi-tenant workspace structure with a full role hierarchy: Super Admin, Admin (Workspace Owner), Manager, and Member.
 * It includes workspace scoping, role management, and an invitation flow, which are essential for platform and workspace administration.
 * @module models/user
 * @requires mongoose
 * @requires bcryptjs
 * @requires crypto
 */

/**
 * Mongoose schema for the User entity.
 * Represents a user within the platform. Users can be platform-level (super_admin) or belong to a specific workspace
 * with roles like 'admin', 'manager', or 'member'.
 *
 * @typedef {object} UserSchema
 * @property {string} email - The unique email address of the user. Serves as the primary identifier. Required.
 * @property {string} [password] - The hashed password of the user. Not required until the user accepts an invitation.
 * @property {string} [firstName] - The first name of the user.
 * @property {string} [lastName] - The last name of the user.
 * @property {mongoose.Schema.Types.ObjectId} [workspaceId] - A reference to the Workspace this user belongs to. Required for all roles except 'super_admin'.
 * @property {string} role - The user's role ('super_admin', 'admin', 'manager', 'member'). Required.
 * @property {string} status - The current status of the user account (e.g., 'pending', 'active').
 * @property {string} [invitationToken] - A token sent to the user for them to accept the invitation and set their password.
 * @property {Date} [invitationExpires] - The expiry date for the invitation token.
 * @property {Date} [createdAt] - The date and time when the user account was created.
 * @property {Date} [updatedAt] - The date and time when the user account was last updated.
 */
const userSchema = new Schema({
    // Note: 'username' was removed in favor of using 'email' as the primary unique identifier for simplicity.
    email: {
        type: String,
        required: [true, 'Email is required.'],
        unique: true, // Ensures one account per email address across the entire platform.
        trim: true,
        lowercase: true,
        match: [/.+@.+\..+/, 'Please provide a valid email address.']
    },
    password: {
        type: String,
        // Password is not required on creation, as users are invited first.
        // It becomes required when the user accepts the invitation and sets it.
        // This logic is handled in the controller/service layer.
        select: false // Security Best Practice: Exclude password from query results by default.
    },
    firstName: {
        type: String,
        trim: true
    },
    lastName: {
        type: String,
        trim: true
    },
    // Core feature: Links user to a specific workspace for multi-tenancy.
    // All non-super_admin actions are scoped by this ID.
    workspaceId: {
        type: Schema.Types.ObjectId,
        ref: 'Workspace', // Assumes a 'Workspace' model exists.
        // HIERARCHY FIX: A workspace is required for all roles except the platform-level 'super_admin'.
        // This enforces tenant boundaries for all workspace-specific users and correctly models the platform owner role.
        required: [
            function() { return this.role !== 'super_admin'; },
            'User must be associated with a workspace unless they are a super_admin.'
        ],
        index: true
    },
    // Core feature: Defines user permissions.
    role: {
        type: String,
        // HIERARCHY FIX: Expanded roles to support the full platform hierarchy as required.
        // 'super_admin': Platform-level owner, not tied to a workspace.
        // 'admin': Workspace owner, manages billing and top-level settings for their workspace.
        // 'manager': Manages members and resources within a workspace.
        // 'member': Standard user within a workspace.
        enum: ['super_admin', 'admin', 'manager', 'member'],
        required: true,
        default: 'member'
    },
    // Core feature: Manages the user lifecycle from invitation to active use.
    // This is used to check against plan limits (e.g., count 'active' users in a workspace).
    status: {
        type: String,
        enum: ['pending', 'active'],
        default: 'pending'
    },
    // Fields to support the invitation flow.
    invitationToken: {
        type: String,
        select: false
    },
    invitationExpires: {
        type: Date,
        select: false
    }
}, {
    timestamps: true // Adds createdAt and updatedAt fields automatically.
});

/**
 * Mongoose pre-save hook to automatically hash the password before saving.
 * This ensures that plain-text passwords are never stored in the database.
 */
userSchema.pre('save', async function(next) {
    // BUGFIX: Robustly check if a new, non-empty password needs hashing.
    // This prevents errors from trying to hash a null or unmodified password.
    if (!this.isModified('password') || !this.password) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(12); // Strong salt factor.
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

/**
 * Instance method to compare a candidate password with the user's stored hash.
 * @param {string} candidatePassword The password to compare.
 * @returns {Promise<boolean>} A promise that resolves to true if the passwords match, false otherwise.
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
    // A query explicitly selecting `+password` is needed before calling this method.
    // BUGFIX: Handle cases where this.password is null (e.g., for a 'pending' user who hasn't set a password).
    if (!this.password || !candidatePassword) {
        return false;
    }
    return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Instance method to generate an invitation token.
 * This is called when a manager invites a new user.
 * @returns {string} The unhashed token to be sent to the user via email.
 */
userSchema.methods.generateInvitationToken = function() {
    // Generate a random, secure token.
    const token = crypto.randomBytes(32).toString('hex'); // Increased token length for better security.

    // Hash the token before saving it to the database for added security.
    this.invitationToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    // Set an expiration for the token (e.g., 24 hours).
    this.invitationExpires = Date.now() + 24 * 60 * 60 * 1000;

    // Return the unhashed token to be sent in the invitation email.
    return token;
};


// --- Database Indexes for Performance Optimization ---

// Optimizes queries for finding active/pending users within a specific workspace.
// Crucial for checking member counts against subscription plan limits.
userSchema.index({ workspaceId: 1, status: 1 });

// Optimizes queries for finding users by their role within a workspace.
// Useful for authorization checks (e.g., is this user an 'admin' or 'manager'?).
userSchema.index({ workspaceId: 1, role: 1 });

// Index to quickly find a user by their invitation token during the registration process.
userSchema.index({ invitationToken: 1 });


/**
 * Mongoose model for the User entity.
 * Provides an interface for interacting with the 'users' collection in the database.
 *
 * @type {mongoose.Model<UserSchema>}
 * @alias User
 */
module.exports = mongoose.model('User', userSchema);