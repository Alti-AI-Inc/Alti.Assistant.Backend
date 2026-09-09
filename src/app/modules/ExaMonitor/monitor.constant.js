export const MONITOR_STATUS = ['active', 'paused', 'disabled'];
export const MONITOR_TRIGGER_TYPE = ['interval'];

// Matches Exa's period format: an integer followed by 'h' or 'd'
// (e.g. "1h", "6h", "1d", "7d"). Minimum interval is 1 hour, enforced
// on Exa's side — this regex only checks shape, not the minimum value.
export const MONITOR_TRIGGER_PERIOD_REGEX = /^\d+[hd]$/;

export const MONITOR_FILTERABLE_FIELDS = ['searchTerm', 'status'];
export const MONITOR_SEARCHABLE_FIELDS = ['name', 'search.query'];
export const MONITOR_PAGINATION_FIELDS = ['page', 'limit', 'sortBy', 'sortOrder'];

export const MONITOR_WEBHOOK_EVENTS = [
  'monitor.created',
  'monitor.updated',
  'monitor.deleted',
  'monitor.run.created',
  'monitor.run.completed',
];
export const MONITOR_RUN_STATUS = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
];

export const MONITOR_RUN_FAIL_REASON = [
  'CRAWL_NOT_FOUND',
  'CRAWL_TIMEOUT',
  'CRAWL_LIVECRAWL_TIMEOUT',
  'SOURCE_NOT_AVAILABLE',
  'CRAWL_UNKNOWN_ERROR',
];

export const MONITOR_RUN_FILTERABLE_FIELDS = ['status', 'failReason'];
export const MONITOR_RUN_PAGINATION_FIELDS = [
  'page',
  'limit',
  'sortBy',
  'sortOrder',
];
