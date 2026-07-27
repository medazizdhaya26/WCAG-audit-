export type AuditReport = {
  id: string;
  url: string;
  score: number;
  issues: any;
  screenshot?: string | null;
  critical: number;
  serious: number;
  moderate: number;
  createdAt: Date;
};
