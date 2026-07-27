import { WaveCategory, WaveResult, WaveSeverity } from './wave.types';

type AxeViolation = {
  id: string;
  impact: string;
  description: string;
  help: string;
  helpUrl?: string;
  nodes: Array<{
    target: string[];
    html: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }>;
};

const AXE_RULE_TO_WAVE: Record<string, {
  category: WaveCategory;
  type: string;
  severity: WaveSeverity;
  message: string;
}> = {
  'image-alt': {
    category: WaveCategory.ERRORS,
    type: 'missing-image-alt',
    severity: WaveSeverity.HIGH,
    message: 'Missing alternative text for image',
  },
  'input-image-alt': {
    category: WaveCategory.ERRORS,
    type: 'missing-image-input-alt',
    severity: WaveSeverity.HIGH,
    message: 'Missing alternative text for image input',
  },
  'label': {
    category: WaveCategory.ERRORS,
    type: 'missing-form-label',
    severity: WaveSeverity.HIGH,
    message: 'Missing form label',
  },
  'link-name': {
    category: WaveCategory.ERRORS,
    type: 'missing-link-name',
    severity: WaveSeverity.HIGH,
    message: 'Missing accessible name for link',
  },
  'button-name': {
    category: WaveCategory.ERRORS,
    type: 'missing-button-name',
    severity: WaveSeverity.HIGH,
    message: 'Missing accessible name for button',
  },
  'color-contrast': {
    category: WaveCategory.CONTRAST,
    type: 'low-contrast',
    severity: WaveSeverity.HIGH,
    message: 'Insufficient color contrast',
  },
  'heading-order': {
    category: WaveCategory.ALERTS,
    type: 'skipped-heading-level',
    severity: WaveSeverity.MEDIUM,
    message: 'Skipped heading level',
  },
  'html-has-lang': {
    category: WaveCategory.FEATURES,
    type: 'document-language',
    severity: WaveSeverity.INFO,
    message: 'Document language specified',
  },
  'document-title': {
    category: WaveCategory.FEATURES,
    type: 'document-title',
    severity: WaveSeverity.INFO,
    message: 'Document has title',
  },
  'frame-title': {
    category: WaveCategory.FEATURES,
    type: 'frame-title',
    severity: WaveSeverity.INFO,
    message: 'Frame has title',
  },
  'landmark-one-main': {
    category: WaveCategory.STRUCTURE,
    type: 'main-landmark',
    severity: WaveSeverity.INFO,
    message: 'Main landmark exists',
  },
  'region': {
    category: WaveCategory.STRUCTURE,
    type: 'landmark-region',
    severity: WaveSeverity.INFO,
    message: 'Landmark region exists',
  },
  'aria-input-field-name': {
    category: WaveCategory.ARIA,
    type: 'aria-input-label',
    severity: WaveSeverity.INFO,
    message: 'ARIA input field name',
  },
  'aria-toggle-field-name': {
    category: WaveCategory.ARIA,
    type: 'aria-toggle-label',
    severity: WaveSeverity.INFO,
    message: 'ARIA toggle field name',
  },
};

export class AxeToWaveMapper {
  static mapViolations(axeViolations: AxeViolation[]): WaveResult[] {
    const results: WaveResult[] = [];

    for (const violation of axeViolations) {
      const mapping = AXE_RULE_TO_WAVE[violation.id];

      if (!mapping) {
        continue;
      }

      for (const node of violation.nodes) {
        results.push({
          category: mapping.category,
          type: mapping.type,
          severity: mapping.severity,
          message: mapping.message,
          selector: node.target?.[0],
          html: node.html,
          details: {
            axeRuleId: violation.id,
            axeImpact: violation.impact,
            axeHelp: violation.help,
            axeHelpUrl: violation.helpUrl,
          },
          boundingBox: node.boundingBox,
        });
      }
    }

    return results;
  }

  static getSeverityWeight(severity: WaveSeverity): number {
    switch (severity) {
      case WaveSeverity.HIGH:
        return 10;
      case WaveSeverity.MEDIUM:
        return 5;
      case WaveSeverity.LOW:
        return 2;
      case WaveSeverity.INFO:
        return 0;
      default:
        return 0;
    }
  }
}
