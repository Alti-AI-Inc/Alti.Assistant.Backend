import mongoose from 'mongoose';

// Sub-schema for members within a workspace.
// This defines the structure for each team member, including their user reference and role.
const MemberSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Assumes a 'User' model exists for relation.
        required: true,
    },
    role: {
        type: String,
        enum: ['owner', 'admin', 'manager', 'member'],
        default: 'member',
        required: true,
    },
    joinedAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: false }); // Using _id: false as the user ObjectId can serve as the unique key within the array.

// Sub-schema for pending invitations.
// This tracks invitations sent to new users, including a unique token for acceptance.
const InvitationSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    role: {
        type: String,
        enum: ['admin', 'manager', 'member'], // Owner role cannot be assigned via invitation.
        default: 'member',
        required: true,
    },
    token: {
        type: String,
        required: true,
        unique: true,
    },
    invitedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
}, { timestamps: { createdAt: 'invitedAt' } });

// Sub-schema for the workspace's subscription plan.
// This schema intentionally omits sensitive billing details (e.g., Stripe IDs, payment methods)
// to ensure managers and other non-billing roles cannot access them through this model.
const PlanSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['free', 'starter', 'pro', 'enterprise'],
        default: 'free',
        required: true,
    },
    memberLimit: {
        type: Number,
        default: 5, // Example limit for a free plan.
    },
    // Add other plan-specific limits as needed for metrics.
    // e.g., apiCallLimit: { type: Number, default: 10000 }
}, { _id: false });

// Main schema for the Workspace.
// This model replaces the generic 'Tenant' alias to provide a structured and secure
// representation of a workspace, tailored for manager dashboard features.
const WorkspaceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Workspace name is required.'],
        trim: true,
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    members: {
        type: [MemberSchema],
        validate: [
            // Validator to ensure the owner is always present in the members list.
            {
                validator: function(members) {
                    return members.some(member => member.user.equals(this.owner) && member.role === 'owner');
                },
                message: 'The workspace owner must be included in the members list with the owner role.'
            }
        ]
    },
    invitations: [InvitationSchema],
    plan: {
        type: PlanSchema,
        default: () => ({}), // Creates a default plan object on new workspace creation.
    },
    // Metrics relevant to the manager's dashboard for performance and usage tracking.
    metrics: {
        apiCalls: { type: Number, default: 0 },
        projectsCount: { type: Number, default: 0 },
        storageUsedMB: { type: Number, default: 0 },
    },
    // General workspace settings that managers might configure.
    settings: {
        timezone: { type: String, default: 'UTC' },
        // Add other non-sensitive settings as needed.
    }
}, {
    timestamps: true, // Adds createdAt and updatedAt timestamps automatically.
});

// --- Indexes for Performance Optimization ---
// Index for quickly finding workspaces a user belongs to.
WorkspaceSchema.index({ 'members.user': 1 });
// Index for quickly finding an invitation by its unique token.
WorkspaceSchema.index({ 'invitations.token': 1 });
// Index for quickly finding workspaces by their owner.
WorkspaceSchema.index({ owner: 1 });


// --- Virtuals for Computed Properties ---
// Virtual property to get the current number of members without needing to calculate it on the client.
WorkspaceSchema.virtual('memberCount').get(function() {
    return this.members.length;
});


// --- Instance Methods for Encapsulated Business Logic ---
/**
 * Checks if the workspace has reached its member limit according to its plan.
 * This is a crucial check before sending new invitations to prevent exceeding plan limits.
 * @returns {boolean} True if the member limit has been reached or exceeded.
 */
WorkspaceSchema.methods.isAtMemberLimit = function() {
    // Considers both current members and pending invitations against the plan's limit.
    const potentialMembers = this.members.length + this.invitations.length;
    return potentialMembers >= this.plan.memberLimit;
};

/**
 * Retrieves the role of a specific user within the workspace.
 * @param {mongoose.Types.ObjectId | string} userId - The ID of the user.
 * @returns {string|null} The user's role ('owner', 'admin', etc.) or null if the user is not a member.
 */
WorkspaceSchema.methods.getMemberRole = function(userId) {
    const member = this.members.find(m => m.user.equals(userId));
    return member ? member.role : null;
};

/**
 * Checks if a user is a member of the workspace.
 * @param {mongoose.Types.ObjectId | string} userId - The ID of the user.
 * @returns {boolean} True if the user is a member.
 */
WorkspaceSchema.methods.isMember = function(userId) {
    return this.members.some(m => m.user.equals(userId));
};


// Ensure virtual properties are included when the model is converted to JSON or a plain object.
WorkspaceSchema.set('toJSON', { virtuals: true });
WorkspaceSchema.set('toObject', { virtuals: true });

const Workspace = mongoose.model('Workspace', WorkspaceSchema);

export default Workspace;