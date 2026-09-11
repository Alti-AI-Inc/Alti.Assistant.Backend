import { Schema, model } from 'mongoose';
import {
  EXA_ENRICHMENT_STATUS,
  EXA_ENTITY_TYPE,
  EXA_ITEM_SOURCE,
  EXA_RESEARCH_STATUS,
  EXA_SATISFIED,
  EXA_WEBSET_SEARCH_STATUS,
} from './exaResearch.contant.js';

/** A {title, snippet, url} reference, used inside evaluations and enrichment results. */
const referenceSchema = new Schema(
  {
    title: { type: String, trim: true },
    snippet: { type: String },
    url: { type: String, trim: true },
  },
  { _id: false }
);

/** Result of checking one item against one of the search's criteria. */
const evaluationSchema = new Schema(
  {
    criterion: { type: String },
    reasoning: { type: String },
    satisfied: { type: String, enum: EXA_SATISFIED },
    references: { type: [referenceSchema], default: undefined },
  },
  { _id: false }
);

/** Result of one enrichment applied to one item. `result` is always a string array or null. */
const enrichmentResultSchema = new Schema(
  {
    enrichmentId: { type: String },
    format: { type: String },
    result: { type: [String], default: undefined },
    reasoning: { type: String },
    references: { type: [referenceSchema], default: undefined },
  },
  { _id: false }
);

// Entity-specific property shapes (see "Item Properties by Entity Type" in the Websets reference).
const companyPropsSchema = new Schema(
  {
    name: String,
    location: String,
    employees: Number,
    industry: String,
    about: String,
    logoUrl: String,
  },
  { _id: false }
);

const personPropsSchema = new Schema(
  {
    name: String,
    location: String,
    position: String,
    pictureUrl: String,
  },
  { _id: false }
);

const contentPropsSchema = new Schema(
  {
    author: String,
    publishedAt: String,
  },
  { _id: false }
); // shared shape for article / research_paper / custom

const itemPropertiesSchema = new Schema(
  {
    type: { type: String, enum: EXA_ENTITY_TYPE },
    url: { type: String },
    description: { type: String },
    content: { type: String },
    company: companyPropsSchema,
    person: personPropsSchema,
    article: contentPropsSchema,
    researchPaper: contentPropsSchema,
    custom: contentPropsSchema,
  },
  { _id: false }
);

/** One WebsetItem, mirrored from Exa (no own _id — matched by itemId when we need to update in place). */
const websetItemSchema = new Schema(
  {
    itemId: { type: String, required: true }, // Exa's wsi_... id
    source: { type: String, enum: EXA_ITEM_SOURCE },
    sourceId: { type: String },
    properties: itemPropertiesSchema,
    evaluations: { type: [evaluationSchema], default: undefined },
    enrichments: { type: [enrichmentResultSchema], default: undefined },
    exaCreatedAt: { type: Date },
    exaUpdatedAt: { type: Date },
  },
  { _id: false }
);

const searchProgressSchema = new Schema(
  {
    found: { type: Number },
    completion: { type: Number },
  },
  { _id: false }
);

const searchCriterionSchema = new Schema(
  {
    description: { type: String },
    successRate: { type: Number },
  },
  { _id: false }
);

/** One WebsetSearch (the initial search plus any added later), mirrored from Exa. */
const websetSearchSchema = new Schema(
  {
    searchId: { type: String, required: true }, // Exa's ws_search_... id
    status: { type: String, enum: EXA_WEBSET_SEARCH_STATUS },
    query: { type: String },
    entity: { type: Schema.Types.Mixed },
    criteria: { type: [searchCriterionSchema], default: undefined },
    count: { type: Number },
    maxPeoplePerCompany: { type: Number },
    progress: searchProgressSchema,
    canceledAt: { type: Date },
    canceledReason: { type: String },
    exaCreatedAt: { type: Date },
    exaUpdatedAt: { type: Date },
  },
  { _id: false }
);

/** A webset-level enrichment *configuration* (not a result — results live on each item). */
const websetEnrichmentConfigSchema = new Schema(
  {
    enrichmentId: { type: String, required: true },
    status: { type: String, enum: EXA_ENRICHMENT_STATUS },
    title: { type: String },
    description: { type: String },
    format: { type: String },
    options: { type: Schema.Types.Mixed },
    instructions: { type: String },
  },
  { _id: false }
);

const exaResearchSchema = new Schema(
  {
    space: {
      type: Schema.Types.ObjectId,
      ref: 'Space',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    searchSession: {
      type: Schema.Types.ObjectId,
      // FIX: the model registered in searchResearch.model.js is named
      // 'ResearchSession' (not 'SearchSession') — this ref was pointing at a
      // model that doesn't exist, which silently breaks .populate().
      ref: 'ResearchSession',
      required: true,
      index: true,
    },
    query: {
      type: String,
      required: [true, 'Search query is required'],
      trim: true,
      maxlength: [1000, 'Query cannot exceed 1000 characters'],
    },
    // Target number of items requested (Webset search.count). Actual items
    // found may be fewer depending on query complexity.
    count: {
      type: Number,
      min: 1,
    },
    // Raw request body we sent to POST /websets/v0/websets/. Left schemaless
    // deliberately — kept for support/debugging, this module does not
    // otherwise depend on its shape.
    requestParams: {
      type: Schema.Types.Mixed,
      default: {},
    },
    // Exa's own webset id (ws_...). Not present until the create call succeeds.
    websetId: {
      type: String,
      index: true,
      sparse: true,
    },
    // Our idempotency key sent as Exa's `externalId` on create — we set this
    // to this document's own _id, so it's redundant with `_id` but kept
    // explicit since it's echoed back verbatim by Exa on every response.
    externalId: {
      type: String,
      index: true,
      sparse: true,
    },
    searches: {
      type: [websetSearchSchema],
      default: [],
    },
    enrichments: {
      type: [websetEnrichmentConfigSchema],
      default: [],
    },
    items: {
      type: [websetItemSchema],
      default: [],
    },
    status: {
      type: String,
      enum: EXA_RESEARCH_STATUS,
      default: 'running',
      index: true,
    },
    errorMessage: { type: String },
    // Last time this record was refreshed from Exa, whether via webhook or
    // manual sync. Undefined until the first successful sync.
    lastSyncedAt: { type: Date },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isFavorite: {
      type: Boolean,
      default: false,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

exaResearchSchema.index({ space: 1, createdAt: -1 });
exaResearchSchema.index({ searchSession: 1, createdAt: -1 });
exaResearchSchema.index({ space: 1, user: 1 });
exaResearchSchema.index({ query: 'text', tags: 'text' });

// Computed on read rather than stored: most updates to `items` happen via
// findByIdAndUpdate/updateOne (webhook + sync paths), which don't run
// pre('save') hooks, so a stored counter would drift. A virtual is always
// accurate but can't be queried/sorted on directly in Mongo — acceptable
// trade-off here since item count isn't used as a filter anywhere.
exaResearchSchema.virtual('itemCount').get(function itemCount() {
  return this.items?.length ?? 0;
});

export const ExaResearch = model('Exa-Research', exaResearchSchema);