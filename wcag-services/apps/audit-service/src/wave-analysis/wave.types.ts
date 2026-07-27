export enum WaveCategory {
  ERRORS = 'errors',
  CONTRAST = 'contrast',
  ALERTS = 'alerts',
  FEATURES = 'features',
  STRUCTURE = 'structure',
  ARIA = 'aria'
}

export enum WaveSeverity {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info'
}

export type WaveResult = {
  id?: string;
  category: WaveCategory;
  type: string;
  severity: WaveSeverity;
  message: string;
  label?: string; // code court affiché dans l'icône (ex: H1, ALT, ARIA)
  selector?: string;
  html?: string;
  xpath?: string;
  details?: any;
  boundingBox?: { x: number; y: number; width: number; height: number };
};

export type WaveSummary = {
  errors: number;
  contrastErrors: number;
  alerts: number;
  features: number;
  structure: number;
  aria: number;
  score: number;
};

export type WaveAnalysisResult = {
  summary: WaveSummary;
  categories: Record<WaveCategory, WaveResult[]>;
};
