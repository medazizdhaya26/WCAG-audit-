export type StartWebsiteAuditDto = {
  url?: string;
  /** Liste d'URLs à auditer manuellement (mode sans crawling). Si présent, prioritaire sur url. */
  urls?: string[];
  maxDepth?: number;
  maxPages?: number;
  renderJs?: boolean;
};
