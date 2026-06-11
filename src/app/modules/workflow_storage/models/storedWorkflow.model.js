/**
 * @file Defines the Mongoose schema and model for StoredWorkflows.
 * This model represents a user-defined workflow, including its structure,
 * execution plan, associated metadata, and status.
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} WorkflowExecutionStep
 * @property {number} step - The order of the step in the execution plan.
 * @property {string} app - The slug or identifier of the application/tool to be used in this step.
 * @property {string} action - The specific action to be performed within the app.
 * @property {string} [description] - A brief description of what this step does.
 * @property {object} [parameters] - Key-value pairs of parameters required for the action. Can be mixed type.
 * @property {number[]} [dependencies] - An array of step numbers that this step depends on.
 * @property {object} [outputMapping] - Defines how the output of this step should be mapped or transformed. Can be mixed type.
 */

/**
 * @typedef {object} WorkflowPlanningMetadata
 * @property {string} [reasoning] - The AI's reasoning behind the workflow plan.
 * @property {number} [confidence] - A confidence score for the generated plan.
 * @property {Date} [planningTime] - The timestamp when the planning was completed.
 * @property {string} [executionType] - The type of execution planned (e.g., 'sequential', 'parallel').
 */

/**
 * @typedef {object} ConnectedAccount
 * @property {string} _id - The ID of the connected account.
 * @property {string} userId - The ID of the user who owns the connection.
 * @property {string} app - The slug of the application this account connects to.
 * @property {object} [toolkit] - Optional toolkit information associated with the app.
 * @property {string} [toolkit.slug] - The slug of the toolkit.
 * @property {string} [toolkit.name] - The name of the toolkit.
 * @property {string} [name] - A user-friendly name for the connection.
 * @property {string} [status] - The status of the connection (e.g., 'connected', 'disconnected').
 * @property {Date} [createdAt] - The timestamp when the connection was created.
 * @property {Date} [updatedAt] - The timestamp when the connection was last updated.
 */

/**
 * @typedef {object} StoredWorkflowDocument
 * @property {string} workflowId - A unique identifier for the workflow.
 * @property {string} userId - The ID of the user who owns this workflow.
 * @property {string} title - The title of the workflow.
 * @property {string} [description] - A detailed description of the workflow.
 * @property {'single_step'|'multi_step'} workflowType - The type of the workflow, either single or multi-step.
 * @property {'draft'|'ready'|'archived'} [status='draft'] - The current status of the workflow.
 * @property {string[]} requiredApps - An array of application slugs required for this workflow to function.
 * @property {WorkflowExecutionStep[]} executionPlan - An ordered list of steps defining the workflow's execution.
 * @property {number} totalSteps - The total number of steps in the workflow.
 * @property {object} [crossStepParameters] - Parameters that can be shared or passed between different steps. Can be mixed type.
 * @property {string} originalUserInput - The original natural language input from the user that led to this workflow.
 * @property {WorkflowPlanningMetadata} [planningMetadata] - Metadata related to the AI planning process.
 * @property {string} [conversationId] - The ID of the conversation context this workflow belongs to.
 * @property {object} [conversationContext] - Additional context from the conversation. Can be mixed type.
 * @property {ConnectedAccount[]} [connectedAccounts] - An array of connected accounts relevant to this workflow.
 * @property {string[]} [missingConnections] - An array of app slugs for which connections are missing.
 * @property {string[]} [tags] - An array of tags associated with the workflow for categorization and search.
 * @property {'automation'|'data_processing'|'communication'|'productivity'|'integration'|'other'} [category='other'] - The category of the workflow.
 * @property {boolean} [isTemplate=false] - Indicates if this workflow is a template.
 * @property {number} [executionCount=0] - The number of times this workflow has been executed.
 * @property {Date} [lastExecuted] - The timestamp of the last successful execution.
 * @property {Date} createdAt - The timestamp when the workflow was created.
 * @property {Date} updatedAt - The timestamp when the workflow was last updated.
 * @property {boolean} isExecutable - Virtual field: True if the workflow status is 'ready' and all required connections are present.
 * @property {'simple'|'medium'|'complex'} complexity - Virtual field: Categorizes workflow complexity based on total steps.
 */

/**
 * Mongoose Schema for StoredWorkflow.
 * Defines the structure and validation for storing user-defined workflows.
 * @type {mongoose.Schema<StoredWorkflowDocument>}
 */
const storedWorkflowSchema = new mongoose.Schema(
  {
    /**
     * A unique identifier for the workflow.
     * @type {string}
     * @required
     * @unique
     * @index
     */
    workflowId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /**
     * The ID of the user who owns this workflow.
     * @type {string}
     * @required
     * @index
     */
    userId: {
      type: String,
      required: true,
      // OPTIMIZATION: Individual index removed; covered by multiple compound indexes below.
    },
    /**
     * The title of the workflow.
     * @type {string}
     * @required
     * @maxlength 200
     */
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    /**
     * A detailed description of the workflow.
     * @type {string}
     * @maxlength 1000
     */
    description: {
      type: String,
      maxlength: 1000,
    },
    /**
     * The type of the workflow, either single or multi-step.
     * @type {'single_step'|'multi_step'}
     * @required
     * @enum ['single_step', 'multi_step']
     * @index
     */
    workflowType: {
      type: String,
      enum: ['single_step', 'multi_step'],
      required: true,
      // OPTIMIZATION: Individual index removed; covered by compound index { userId: 1, workflowType: 1 }.
    },
    /**
     * The current status of the workflow.
     * @type {'draft'|'ready'|'archived'}
     * @default 'draft'
     * @enum ['draft', 'ready', 'archived']
     * @index
     */
    status: {
      type: String,
      enum: ['draft', 'ready', 'archived'],
      default: 'draft',
      // OPTIMIZATION: Individual index removed; covered by compound index { userId: 1, status: 1 }.
    },
    /**
     * An array of application slugs required for this workflow to function.
     * @type {string[]}
     * @required
     */
    requiredApps: [
      {
        type: String,
        required: true,
      },
    ],
    /**
     * An ordered list of steps defining the workflow's execution.
     * Each step includes details about the app, action, parameters, and dependencies.
     * @type {WorkflowExecutionStep[]}
     */
    executionPlan: [
      {
        /**
         * The order of the step in the execution plan.
         * @type {number}
         * @required
         */
        step: {
          type: Number,
          required: true,
        },
        /**
         * The slug or identifier of the application/tool to be used in this step.
         * @type {string}
         * @required
         */
        app: {
          type: String,
          required: true,
        },
        /**
         * The specific action to be performed within the app.
         * @type {string}
         * @required
         */
        action: {
          type: String,
          required: true,
        },
        /**
         * A brief description of what this step does.
         * @type {string}
         */
        description: {
          type: String,
        },
        /**
         * Key-value pairs of parameters required for the action.
         * This can be a mixed type to allow flexible data structures.
         * @type {object}
         * @default {}
         */
        parameters: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
        /**
         * An array of step numbers that this step depends on.
         * @type {number[]}
         */
        dependencies: [
          {
            type: Number,
          },
        ],
        /**
         * Defines how the output of this step should be mapped or transformed.
         * This can be a mixed type to allow flexible data structures.
         * @type {object}
         * @default {}
         */
        outputMapping: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
      },
    ],
    /**
     * The total number of steps in the workflow.
     * @type {number}
     * @required
     * @min 1
     */
    totalSteps: {
      type: Number,
      required: true,
      min: 1,
    },
    /**
     * Parameters that can be shared or passed between different steps.
     * This can be a mixed type to allow flexible data structures.
     * @type {object}
     * @default {}
     */
    crossStepParameters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    /**
     * The original natural language input from the user that led to this workflow.
     * @type {string}
     * @required
     */
    originalUserInput: {
      type: String,
      required: true,
    },
    /**
     * Metadata related to the AI planning process that generated this workflow.
     * @type {WorkflowPlanningMetadata}
     */
    planningMetadata: {
      /**
       * The AI's reasoning behind the workflow plan.
       * @type {string}
       */
      reasoning: String,
      /**
       * A confidence score for the generated plan.
       * @type {number}
       */
      confidence: Number,
      /**
       * The timestamp when the planning was completed.
       * @type {Date}
       */
      planningTime: Date,
      /**
       * The type of execution planned (e.g., 'sequential', 'parallel').
       * @type {string}
       */
      executionType: String,
    },
    /**
     * The ID of the conversation context this workflow belongs to.
     * @type {string}
     * @index
     */
    conversationId: {
      type: String,
      index: true,
    },
    /**
     * Additional context from the conversation.
     * This can be a mixed type to allow flexible data structures.
     * @type {object}
     * @default {}
     */
    conversationContext: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    /**
     * An array of connected accounts relevant to this workflow.
     * Each element can be a mixed type to store various account details.
     * @type {ConnectedAccount[]}
     */
    connectedAccounts: [
      {
        type: mongoose.Schema.Types.Mixed,
      },
    ],
    /**
     * An array of app slugs for which connections are missing,
     * indicating that the workflow cannot be fully executed.
     * @type {string[]}
     */
    missingConnections: [
      {
        type: String,
      },
    ],
    /**
     * An array of tags associated with the workflow for categorization and search.
     * Tags are trimmed before saving.
     * @type {string[]}
     */
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    /**
     * The category of the workflow.
     * @type {'automation'|'data_processing'|'communication'|'productivity'|'integration'|'other'}
     * @default 'other'
     * @enum ['automation', 'data_processing', 'communication', 'productivity', 'integration', 'other']
     */
    category: {
      type: String,
      enum: [
        'automation',
        'data_processing',
        'communication',
        'productivity',
        'integration',
        'other',
      ],
      default: 'other',
    },
    /**
     * Indicates if this workflow is a template that can be reused or shared.
     * @type {boolean}
     * @default false
     */
    isTemplate: {
      type: Boolean,
      default: false,
    },
    /**
     * The number of times this workflow has been executed.
     * @type {number}
     * @default 0
     */
    executionCount: {
      type: Number,
      default: 0,
    },
    /**
     * The timestamp of the last successful execution.
     * @type {Date}
     */
    lastExecuted: {
      type: Date,
    },
    // `createdAt` and `updatedAt` fields are automatically managed by the `timestamps: true` option.
    // Explicit definition of these fields and the `pre('save')` hook for `updatedAt` are redundant
    // and have been removed to avoid potential conflicts and simplify the schema.
  },
  {
    /**
     * Mongoose options for the schema.
     * `timestamps: true` automatically adds `createdAt` and `updatedAt` fields.
     * `toJSON` and `toObject` options ensure virtuals are included when converting to JSON/Object.
     */
    timestamps: true, // This option automatically adds and manages `createdAt` and `updatedAt` fields.
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
/**
 * Compound index on `userId` and `status` for efficient filtering by user and workflow status.
 * @index
 */
storedWorkflowSchema.index({ userId: 1, status: 1 });
/**
 * Compound index on `userId` and `workflowType` for efficient filtering by user and workflow type.
 * @index
 */
storedWorkflowSchema.index({ userId: 1, workflowType: 1 });
/**
 * Compound index on `userId` and `category` for efficient filtering by user and workflow category.
 * @index
 */
storedWorkflowSchema.index({ userId: 1, category: 1 });
/**
 * Compound index on `userId` and `createdAt` (descending) for efficient retrieval of a user's latest workflows.
 * @index
 */
storedWorkflowSchema.index({ userId: 1, createdAt: -1 });
/**
 * Index on `requiredApps` for efficient querying of workflows that depend on specific applications.
 * @index
 */
storedWorkflowSchema.index({ requiredApps: 1 });
/**
 * Index on `tags` for efficient searching and filtering by tags.
 * @index
 */
storedWorkflowSchema.index({ tags: 1 });
/**
 * Index on `category` for efficient filtering by workflow category.
 * @index
 */
storedWorkflowSchema.index({ category: 1 });

/**
 * OPTIMIZATION: Text index for efficient, case-insensitive searching across multiple fields.
 * This replaces slow, non-indexed $regex queries in the searchWorkflows method.
 * @index
 */
storedWorkflowSchema.index({
  title: 'text',
  description: 'text',
  originalUserInput: 'text',
  tags: 'text',
});

// Virtual fields
/**
 * Virtual field `isExecutable`.
 * Determines if a workflow is ready for execution based on its status and connection requirements.
 * A workflow is executable if its status is 'ready' and it has no missing connections.
 * @type {boolean}
 * @memberof StoredWorkflowDocument
 * @readonly
 */
storedWorkflowSchema.virtual('isExecutable').get(function () {
  return (
    this.status === 'ready' &&
    (!this.missingConnections || this.missingConnections.length === 0)
  );
});

/**
 * Virtual field `complexity`.
 * Categorizes the workflow's complexity based on the total number of steps.
 * - 'simple': 1 step
 * - 'medium': 2-3 steps
 * - 'complex': More than 3 steps
 * @type {'simple'|'medium'|'complex'}
 * @memberof StoredWorkflowDocument
 * @readonly
 */
storedWorkflowSchema.virtual('complexity').get(function () {
  if (this.totalSteps === 1) return 'simple';
  if (this.totalSteps <= 3) return 'medium';
  return 'complex';
});

// Static methods
/**
 * Generates a unique workflow ID.
 * The ID is composed of 'workflow_', current timestamp, and a random alphanumeric string.
 * @static
 * @returns {string} A unique workflow identifier.
 */
storedWorkflowSchema.statics.generateWorkflowId = function () {
  return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Finds workflows by user ID with optional filtering and pagination.
 * @static
 * @param {string} userId - The ID of the user whose workflows to retrieve.
 * @param {object} [options] - Options for filtering, sorting, and pagination.
 * @param {string} [options.status=null] - Filter by workflow status ('draft', 'ready', 'archived').
 * @param {string} [options.workflowType=null] - Filter by workflow type ('single_step', 'multi_step').
 * @param {string} [options.category=null] - Filter by workflow category.
 * @param {number} [options.limit=50] - Maximum number of workflows to return.
 * @param {number} [options.offset=0] - Number of workflows to skip.
 * @param {string} [options.sortBy='createdAt'] - Field to sort by (e.g., 'createdAt', 'title').
 * @param {1|-1} [options.sortOrder=-1] - Sort order (1 for ascending, -1 for descending).
 * @returns {Promise<StoredWorkflowDocument[]>} A promise that resolves to an array of StoredWorkflow documents.
 */
storedWorkflowSchema.statics.findByUserId = function (userId, options = {}) {
  const {
    status = null,
    workflowType = null,
    category = null,
    limit = 50,
    offset = 0,
    sortBy = 'createdAt',
    sortOrder = -1,
  } = options;

  const query = { userId };

  if (status) query.status = status;
  if (workflowType) query.workflowType = workflowType;
  if (category) query.category = category;

  return this.find(query)
    .sort({ [sortBy]: sortOrder })
    .limit(limit)
    .skip(offset)
    .lean(); // OPTIMIZATION: Use .lean() for faster read-only queries by returning plain JS objects.
};

/**
 * Finds all executable workflows for a given user.
 * An executable workflow is one with status 'ready' and no missing connections.
 * @static
 * @param {string} userId - The ID of the user.
 * @returns {Promise<StoredWorkflowDocument[]>} A promise that resolves to an array of executable StoredWorkflow documents.
 */
storedWorkflowSchema.statics.findExecutableWorkflows = function (userId) {
  return this.find({
    userId,
    status: 'ready',
    $or: [
      { missingConnections: { $exists: false } },
      { missingConnections: { $size: 0 } },
    ],
  }).lean(); // OPTIMIZATION: Use .lean() for faster read-only queries.
};

/**
 * Searches for workflows belonging to a user based on a search term.
 * The search is performed across title, description, original user input, and tags.
 * @static
 * @param {string} userId - The ID of the user.
 * @param {string} searchTerm - The term to search for.
 * @param {object} [options] - Options for pagination.
 * @param {number} [options.limit=20] - Maximum number of workflows to return.
 * @param {number} [options.offset=0] - Number of workflows to skip.
 * @returns {Promise<StoredWorkflowDocument[]>} A promise that resolves to an array of matching StoredWorkflow documents.
 */
storedWorkflowSchema.statics.searchWorkflows = function (
  userId,
  searchTerm,
  options = {}
) {
  const { limit = 20, offset = 0 } = options;

  // OPTIMIZATION: Switched from slow, non-indexed $regex to a much faster $text search
  // which utilizes the 'text' index defined on the schema.
  const query = {
    userId,
    $text: { $search: searchTerm },
  };

  return this.find(query)
    .sort({ createdAt: -1 }) // Note: Text search also allows sorting by relevance: .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .skip(offset)
    .lean(); // OPTIMIZATION: Use .lean() for faster read-only queries.
};

// Instance methods
/**
 * Marks the workflow as executed, incrementing the execution count and updating the last executed timestamp.
 * @instance
 * @memberof StoredWorkflowDocument
 * @returns {Promise<StoredWorkflowDocument>} A promise that resolves to the updated StoredWorkflow document.
 */
storedWorkflowSchema.methods.markAsExecuted = function () {
  this.executionCount += 1;
  this.lastExecuted = new Date();
  return this.save();
};

/**
 * Updates the connected accounts for the workflow and recalculates missing connections.
 * Also updates the workflow status if it transitions between 'draft' and 'ready' based on connection availability.
 * @instance
 * @memberof StoredWorkflowDocument
 * @param {ConnectedAccount[]} connectedAccounts - An array of connected account objects.
 * @returns {Promise<StoredWorkflowDocument>} A promise that resolves to the updated StoredWorkflow document.
 */
storedWorkflowSchema.methods.updateConnections = function (connectedAccounts) {
  this.connectedAccounts = connectedAccounts;

  // Update missing connections
  const connectedAppSlugs =
    connectedAccounts?.map((acc) => acc.toolkit?.slug || acc.app) || [];
  this.missingConnections = this.requiredApps.filter(
    (app) => !connectedAppSlugs.includes(app)
  );

  // Update status based on connections
  if (this.missingConnections.length === 0 && this.status === 'draft') {
    this.status = 'ready';
  } else if (this.missingConnections.length > 0 && this.status === 'ready') {
    // Also handle the case where a connection is lost, moving it back to draft
    this.status = 'draft';
  }

  return this.save();
};

/**
 * Adds new tags to the workflow, ensuring uniqueness.
 * @instance
 * @memberof StoredWorkflowDocument
 * @param {string|string[]} newTags - A single tag string or an array of tag strings to add.
 * @returns {Promise<StoredWorkflowDocument>} A promise that resolves to the updated StoredWorkflow document.
 */
storedWorkflowSchema.methods.addTags = function (newTags) {
  const currentTags = this.tags || [];
  const tagsToAdd = Array.isArray(newTags) ? newTags : [newTags];
  const uniqueTags = [...new Set([...currentTags, ...tagsToAdd])];
  this.tags = uniqueTags;
  return this.save();
};

/**
 * Removes specified tags from the workflow.
 * @instance
 * @memberof StoredWorkflowDocument
 * @param {string|string[]} tagsToRemove - A single tag string or an array of tag strings to remove.
 * @returns {Promise<StoredWorkflowDocument>} A promise that resolves to the updated StoredWorkflow document.
 */
storedWorkflowSchema.methods.removeTags = function (tagsToRemove) {
  const tagsArray = Array.isArray(tagsToRemove) ? tagsToRemove : [tagsToRemove];
  this.tags = (this.tags || []).filter((tag) => !tagsArray.includes(tag));
  return this.save();
};

// The pre-save middleware for `updatedAt` is redundant when `timestamps: true` is used
// and has been removed. Mongoose handles `updatedAt` automatically.
// storedWorkflowSchema.pre('save', function (next) {
//   this.updatedAt = new Date();
//   next();
// });

/**
 * StoredWorkflow Mongoose Model.
 * Provides an interface for interacting with the 'stored_workflows' collection in MongoDB.
 * @type {mongoose.Model<StoredWorkflowDocument>}
 */
const StoredWorkflow = mongoose.model('StoredWorkflow', storedWorkflowSchema);

export default StoredWorkflow;