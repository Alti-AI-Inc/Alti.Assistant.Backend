// Status of an Exa Webset itself, plus our own 'failed' state for
// request-level failures (network error, non-2xx from Exa, etc.)
export const EXA_RESEARCH_STATUS = ['running', 'idle', 'paused', 'failed'];

// Status of an individual search embedded inside a Webset (Webset.searches[])
export const EXA_WEBSET_SEARCH_STATUS = [
  'created',
  'running',
  'completed',
  'canceled',
];

// Status of a webset-level enrichment configuration (Webset.enrichments[])
export const EXA_ENRICHMENT_STATUS = ['pending', 'completed', 'canceled'];

// Entity type Exa detects/returns per item (WebsetItem.properties.type)
export const EXA_ENTITY_TYPE = [
  'company',
  'person',
  'article',
  'research_paper',
  'custom',
];

// How an item entered the webset
export const EXA_ITEM_SOURCE = ['search', 'import'];

// Criterion evaluation outcome (WebsetItem.evaluations[].satisfied)
export const EXA_SATISFIED = ['yes', 'no', 'unclear'];

export const RESEARCH_FILTERABLE_FIELDS = [
  'searchTerm',
  'status',
  'isFavorite',
  'tags',
  'websetId',
];
export const RESEARCH_SEARCHABLE_FIELDS = ['query', 'tags'];
export const RESEARCH_PAGINATION_FIELDS = [
  'page',
  'limit',
  'sortBy',
  'sortOrder',
];
