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
