/**
 * @file Workflow Template Model
 * @module models/workflowTemplate
 * @description Defines the Mongoose schema and model for Workflow Templates.
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} WorkflowTemplateStep
 * @property {string} stepId - Unique identifier for the step within the workflow.
 * @property {'action'|'condition'|'trigger'|'delay'} stepType - The type of the workflow step.
 * @property {string} [description] - A brief description of what this step does.
 * @property {string} [app] - The name of the application associated with this step (e.g., 'Slack', 'Gmail').
 * @property {string} [action] - The specific action to be performed by the app (e.g., 'sendMessage', 'sendEmail').
 * @property {object} [parameters] - Key-value pairs of parameters required for the action or condition.
 * @property {object} [parameterSchema] - JSON schema for validating the 'parameters' object.
 * @property {object} [conditions] - Conditions to be evaluated for 'condition' type steps.
 * @property {number} [order] - The sequential order of this step within the workflow.
 */
/**
 * Mongoose schema for a single step within a workflow template.
 * @type {mongoose.Schema<WorkflowTemplateStep>}
 */
const WorkflowTemplateStepSchema = new mongoose.Schema({
  /**
   * Unique identifier for the step within the workflow.
   * @type {string}
   */
  stepId: String,
  /**
   * The type of the workflow step.
   * @type {'action'|'condition'|'trigger'|'delay'}
   * @required
   */
  stepType: {
    type: String,
    enum: ['action', 'condition', 'trigger', 'delay'],
    required: true,
  },
  /**
   * A brief description of what this step does.
   * @type {string}
   */
  description: String,
  /**
   * The name of the application associated with this step (e.g., 'Slack', 'Gmail').
   * @type {string}
   */
  app: String,
  /**
   * The specific action to be performed by the app (e.g., 'sendMessage', 'sendEmail').
   * @type {string}
   */
  action: String,
  /**
   * Key-value pairs of parameters required for the action or condition.
   * @type {object}
   */
  parameters: Object,
  /**
   * JSON schema for validating the 'parameters' object.
   * @type {object}
   */
  parameterSchema: Object, // Schema for parameter validation
  /**
   * Conditions to be evaluated for 'condition' type steps.
   * @type {object}
   */
  conditions: Object,
  /**
   * The sequential order of this step within the workflow.
   * @type {number}
   */
  order: Number,
});

/**
 * @typedef {object} WorkflowTemplateRating
 * @property {number} average - The average rating of the workflow template.
 * @property {number} count - The total number of ratings received.
 */

/**
 * @typedef {object} WorkflowTemplateExample
 * @property {string} prompt - An example prompt or use case for the template.
 * @property {string} description - A description of the example.
 */

/**
 * @typedef {object} WorkflowTemplate
 * @property {string} name - The name of the workflow template.
 * @property {string} [description] - A detailed description of the workflow template.
 * @property {'email'|'social'|'productivity'|'finance'|'communication'|'other'} category - The category this workflow template belongs to.
 * @property {string[]} [tags] - An array of tags for categorization and search.
 * @property {WorkflowTemplateStep[]} steps - An array of steps that define the workflow.
 * @property {('schedule'|'webhook'|'manual'|'event')[]} [triggerTypes] - Types of triggers that can initiate this workflow.
 * @property {string[]} [requiredApps] - List of applications required for this workflow to function.
 * @property {'beginner'|'intermediate'|'advanced'} [difficulty] - The perceived difficulty level of setting up/using this workflow.
 * @property {number} [usageCount] - The number of times this template has been used or activated.
 * @property {WorkflowTemplateRating} [rating] - Rating information for the template.
 * @property {boolean} [isPublic] - Indicates if the template is publicly visible and usable.
 * @property {mongoose.Schema.Types.ObjectId} [createdBy] - The user who created this template.
 * @property {WorkflowTemplateExample[]} [examples] - Example use cases or prompts for the template.
 * @property {object} [metadata] - Additional metadata for the template.
 * @property {Date} [createdAt] - The date when the workflow template was created.
 * @property {Date} [updatedAt] - The date when the workflow template was last updated.
 */
/**
 * Mongoose schema for a Workflow Template.
 * @type {mongoose.Schema<WorkflowTemplate>}
 */
const WorkflowTemplateSchema = new mongoose.Schema(
  {
    /**
     * The name of the workflow template.
     * @type {string}
     * @required
     * @trim
     */
    name: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * A detailed description of the workflow template.
     * @type {string}
     * @trim
     */
    description: {
      type: String,
      trim: true,
    },
    /**
     * The category this workflow template belongs to.
     * @type {'email'|'social'|'productivity'|'finance'|'communication'|'other'}
     * @required
     */
    category: {
      type: String,
      enum: [
        'email',
        'social',
        'productivity',
        'finance',
        'communication',
        'other',
      ],
      required: true,
    },
    /**
     * An array of tags for categorization and search.
     * @type {string[]}
     */
    tags: [String],
    /**
     * An array of steps that define the workflow.
     * @type {WorkflowTemplateStep[]}
     */
    steps: [WorkflowTemplateStepSchema],
    /**
     * Types of triggers that can initiate this workflow.
     * @type {('schedule'|'webhook'|'manual'|'event')[]}
     */
    triggerTypes: [
      {
        type: String,
        enum: ['schedule', 'webhook', 'manual', 'event'],
      },
    ],
    /**
     * List of applications required for this workflow to function.
     * @type {string[]}
     */
    requiredApps: [String],
    /**
     * The perceived difficulty level of setting up/using this workflow.
     * @type {'beginner'|'intermediate'|'advanced'}
     * @default 'beginner'
     */
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    /**
     * The number of times this template has been used or activated.
     * @type {number}
     * @default 0
     */
    usageCount: {
      type: Number,
      default: 0,
    },
    /**
     * Rating information for the template.
     * @type {WorkflowTemplateRating}
     */
    rating: {
      /**
       * The average rating of the workflow template.
       * @type {number}
       * @default 0
       */
      average: {
        type: Number,
        default: 0,
      },
      /**
       * The total number of ratings received.
       * @type {number}
       * @default 0
       */
      count: {
        type: Number,
        default: 0,
      },
    },
    /**
     * Indicates if the template is publicly visible and usable.
     * @type {boolean}
     * @default true
     */
    isPublic: {
      type: Boolean,
      default: true,
    },
    /**
     * The user who created this template.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref 'User'
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    /**
     * Example use cases or prompts for the template.
     * @type {WorkflowTemplateExample[]}
     */
    examples: [
      {
        /**
         * An example prompt or use case for the template.
         * @type {string}
         */
        prompt: String,
        /**
         * A description of the example.
         * @type {string}
         */
        description: String,
      },
    ],
    /**
     * Additional metadata for the template.
     * @type {object}
     * @default {}
     */
    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    /**
     * Mongoose timestamps option to automatically add `createdAt` and `updatedAt` fields.
     * @type {boolean}
     */
    timestamps: true,
  }
);

/**
 * Indexes for efficient querying of Workflow Templates.
 * Indexes are crucial for performance, especially for a public-facing template gallery.
 */

// Text index for full-text search on name and description.
// Essential for implementing a search bar feature.
WorkflowTemplateSchema.index({ name: 'text', description: 'text' });

// Compound indexes for the most common browsing and filtering patterns.
// This supports finding public templates in a specific category, sorted by rating or usage count.
// The order of fields (isPublic, category, then sort field) is important for query performance.
WorkflowTemplateSchema.index({ isPublic: 1, category: 1, 'rating.average': -1 });
WorkflowTemplateSchema.index({ isPublic: 1, category: 1, usageCount: -1 });

// OPTIMIZATION: The index { category: 1, isPublic: 1 } was removed as it is redundant.
// The compound index { isPublic: 1, category: 1, ... } can efficiently serve queries
// that filter on `isPublic` and `category` alone by using a prefix of the index.
// Removing redundant indexes reduces write overhead and storage space.

// Index to quickly fetch all templates created by a specific user.
WorkflowTemplateSchema.index({ createdBy: 1 });

// Multi-key indexes for filtering by array fields like tags and requiredApps.
// These are common filters in a template gallery. `isPublic` is first for consistency.
WorkflowTemplateSchema.index({ isPublic: 1, tags: 1 });
WorkflowTemplateSchema.index({ isPublic: 1, requiredApps: 1 });

// Index for global sorting by popularity/quality across all templates.
WorkflowTemplateSchema.index({ 'rating.average': -1, usageCount: -1 });


/**
 * Represents the WorkflowTemplate Mongoose model.
 * If the model is already compiled, it uses the existing one; otherwise, it compiles a new one.
 * This prevents `OverwriteModelError` in environments where models might be reloaded (e.g., during testing).
 * @type {mongoose.Model<WorkflowTemplate>}
 */
const WorkflowTemplate =
  mongoose.models.WorkflowTemplate ||
  mongoose.model('WorkflowTemplate', WorkflowTemplateSchema);

export default WorkflowTemplate;