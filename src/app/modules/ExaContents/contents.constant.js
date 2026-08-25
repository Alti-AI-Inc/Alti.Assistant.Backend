export const CONTENT_URL_STATUS = ['success', 'error'];
export const CONTENT_LIVECRAWL_OPTIONS = [
  'never',
  'fallback',
  'always',
  'preferred',
];
export const CONTENT_ERROR_TAG = [
  'CRAWL_NOT_FOUND',
  'CRAWL_TIMEOUT',
  'CRAWL_LIVECRAWL_TIMEOUT',
  'SOURCE_NOT_AVAILABLE',
  'CRAWL_UNKNOWN_ERROR',
];

// Overall record status, derived from the per-url statuses[] array:
// - completed: every url succeeded
// - partial: some urls succeeded, some failed
// - failed: every url failed
export const CONTENT_RECORD_STATUS = ['completed', 'partial', 'failed'];

export const CONTENT_FILTERABLE_FIELDS = [
  'searchTerm',
  'status',
  'isFavorite',
  'tags',
  'sourceSearch',
];
export const CONTENT_SEARCHABLE_FIELDS = ['requestIds', 'tags'];
export const CONTENT_PAGINATION_FIELDS = [
  'page',
  'limit',
  'sortBy',
  'sortOrder',
];
