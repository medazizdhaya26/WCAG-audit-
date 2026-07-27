export const QUEUE_NAMES = {
  CRAWL: 'crawl-queue',
  PAGE_AUDIT: 'page-audit-queue',
  REPORT: 'report-queue',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
