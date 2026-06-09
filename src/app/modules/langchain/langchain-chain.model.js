/**
 * @file Defines the Mongoose schema and model for Langchain Chains.
 * This model represents a configurable sequence of steps (a "chain") used in Langchain applications,
 * allowing users to define and manage complex AI workflows.
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} LangchainChainStepConfig
 * @property {object} [config] - Configuration object specific to the step type.
 *   This can vary widely based on the `type` of the step (e.g., prompt template, LLM parameters, tool arguments).
 */

/**
 * @typedef {object} LangchainChainStep
 * @property {string} name - A unique name for the step within the chain.
 * @property {'prompt'|'llm'|'parser'|'retriever'|'tool'|'branch'} type - The type of operation this step performs.
 * @property {LangchainChainStepConfig} config - Configuration object specific to the step type.
 */

/**
 * Mongoose Schema for a Langchain Chain.
 *
 * Represents a defined sequence of operations (steps) that form a Langchain workflow.
 * Each chain belongs to a specific user and has a unique name.
 *
 * @swagger
 * components:
 *   schemas:
 *     LangchainChain:
 *       type: object
 *       required:
 *         - name
 *         - userId
 *         - steps
 *       properties:
 *         _id:
 *           type: string
 *           description: The unique identifier for the chain.
 *           readOnly: true
 *         name:
 *           type: string
 *           description: A unique name for the Langchain chain.
 *           example: "CustomerSupportBot"
 *         description:
 *           type: string
 *           description: A brief description of what the chain does.
 *           default: ""
 *           example: "A chain to answer common customer support questions using an LLM."
 *         userId:
 *           type: string
 *           description: The ID of the user who owns this chain.
 *           example: "60d0fe4f5ae57d00049d4e5a"
 *         inputVariables:
 *           type: array
 *           items:
 *             type: string
 *           description: A list of variable names that this chain expects as input.
 *           default: []
 *           example: ["query", "history"]
 *         outputVariables:
 *           type: array
 *           items:
 *             type: string
 *           description: A list of variable names that this chain will produce as output.
 *           default: []
 *           example: ["answer"]
 *         steps:
 *           type: array
 *           description: An ordered list of steps that constitute the chain's logic.
 *           items:
 *             type: object
 *             required:
 *               - name
 *               - type
 *             properties:
 *               name:
 *                 type: string
 *                 description: A unique name for the step within the chain.
 *                 example: "initialPrompt"
 *               type:
 *                 type: string
 *                 description: The type of operation this step performs.
 *                 enum: ['prompt', 'llm', 'parser', 'retriever', 'tool', 'branch']
 *                 example: "prompt"
 *               config:
 *                 type: object
 *                 description: Configuration object specific to the step type (e.g., prompt template, LLM parameters).
 *                 additionalProperties: true
 *                 example:
 *                   template: "You are a helpful AI assistant. {query}"
 *                   inputVariables: ["query"]
 *         isActive:
 *           type: boolean
 *           description: Indicates if the chain is currently active and usable.
 *           default: true
 *         version:
 *           type: number
 *           description: The version number of the chain, useful for tracking changes.
 *           default: 1
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The date and time when the chain was created.
 *           readOnly: true
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: The date and time when the chain was last updated.
 *           readOnly: true
 */
const LangchainChainSchema = new mongoose.Schema(
  {
    /**
     * The name of the Langchain chain. Must be unique per user.
     * @type {string}
     * @required
     * @index
     */
    name: {
      type: String,
      required: true,
      index: true
    },
    /**
     * A brief description of what the chain does.
     * @type {string}
     * @default ''
     */
    description: {
      type: String,
      default: ''
    },
    /**
     * The ID of the user who owns this chain.
     * @type {string}
     * @required
     * @index
     */
    userId: {
      type: String,
      required: true,
      index: true
    },
    /**
     * A list of variable names that this chain expects as input.
     * @type {string[]}
     * @default []
     */
    inputVariables: {
      type: [String],
      default: []
    },
    /**
     * A list of variable names that this chain will produce as output.
     * @type {string[]}
     * @default []
     */
    outputVariables: {
      type: [String],
      default: []
    },
    /**
     * An ordered list of steps that constitute the chain's logic.
     * Each step has a name, type, and configuration.
     * @type {LangchainChainStep[]}
     */
    steps: [
      {
        /**
         * A unique name for the step within the chain.
         * @type {string}
         * @required
         */
        name: {
          type: String,
          required: true
        },
        /**
         * The type of operation this step performs.
         * @type {'prompt'|'llm'|'parser'|'retriever'|'tool'|'branch'}
         * @required
         * @enum {string}
         */
        type: {
          type: String,
          required: true,
          enum: ['prompt', 'llm', 'parser', 'retriever', 'tool', 'branch']
        },
        /**
         * Configuration object specific to the step type.
         * This can vary widely based on the `type` of the step (e.g., prompt template, LLM parameters, tool arguments).
         * @type {mongoose.Schema.Types.Mixed}
         * @default {}
         */
        config: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        }
      }
    ],
    /**
     * Indicates if the chain is currently active and usable.
     * @type {boolean}
     * @default true
     */
    isActive: {
      type: Boolean,
      default: true
    },
    /**
     * The version number of the chain, useful for tracking changes.
     * @type {number}
     * @default 1
     */
    version: {
      type: Number,
      default: 1
    }
  },
  {
    /**
     * Mongoose timestamps option to automatically add `createdAt` and `updatedAt` fields.
     * @type {boolean}
     */
    timestamps: true
  }
);

// Compound index for user and chain name lookup to ensure uniqueness per user.
LangchainChainSchema.index({ userId: 1, name: 1 }, { unique: true });

/**
 * Represents the LangchainChain Mongoose model.
 * This model provides an interface for interacting with the 'langchainchains' collection in MongoDB.
 *
 * @type {mongoose.Model<Document & import('./langchain-chain.model').LangchainChain>}
 */
const LangchainChain = mongoose.models.LangchainChain || mongoose.model('LangchainChain', LangchainChainSchema);

export default LangchainChain;