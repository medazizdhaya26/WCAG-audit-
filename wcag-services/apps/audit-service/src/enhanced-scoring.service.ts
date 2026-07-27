import { Injectable } from '@nestjs/common';
import { AccessibilityIssue } from '../../../libs/database/src/entities/accessibility-issue.entity';
import { IssueImpact as ImpactLevel } from '../../../libs/database/src/entities/enums';

export type CategoryScores = {
  perceivable: number;
  operable: number;
  understandable: number;
  robust: number;
};

export type WCAGCompliance = {
  wcag20A: number;
  wcag20AA: number;
  wcag20AAA: number;
  wcag21A: number;
  wcag21AA: number;
  wcag21AAA: number;
};

export type IssueBreakdown = {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
};

export type ScoringResult = {
  pageScore: number;
  categoryScores: CategoryScores;
  wcagCompliance: WCAGCompliance;
  issueBreakdown: IssueBreakdown;
};

@Injectable()
export class EnhancedScoringService {
  private readonly axeRuleToCategories: Record<string, (keyof CategoryScores)[]> = {
    'color-contrast': ['perceivable'],
    'image-alt': ['perceivable'],
    'input-image-alt': ['perceivable'],
    'label': ['perceivable', 'operable'],
    'link-name': ['perceivable', 'operable'],
    'button-name': ['perceivable', 'operable'],
    'aria-input-field-name': ['perceivable', 'operable'],
    'aria-toggle-field-name': ['perceivable', 'operable'],
    'duplicate-id-active': ['robust'],
    'duplicate-id-aria': ['robust'],
    'heading-order': ['perceivable', 'understandable'],
    'html-has-lang': ['perceivable', 'understandable'],
    'html-lang-valid': ['perceivable', 'understandable'],
    'meta-viewport': ['operable'],
    'bypass': ['operable'],
    'frame-title': ['perceivable', 'understandable'],
    'document-title': ['perceivable', 'understandable'],
    'landmark-one-main': ['perceivable', 'understandable'],
    'region': ['perceivable', 'understandable'],
  };

  private readonly axeRuleToWCAG: Record<string, string[]> = {
    'color-contrast': ['wcag20A', 'wcag20AA', 'wcag21A', 'wcag21AA'],
    'image-alt': ['wcag20A', 'wcag21A'],
    'input-image-alt': ['wcag20A', 'wcag21A'],
    'label': ['wcag20A', 'wcag21A'],
    'link-name': ['wcag20A', 'wcag21A'],
    'button-name': ['wcag20A', 'wcag21A'],
    'heading-order': ['wcag20A', 'wcag21A'],
    'html-has-lang': ['wcag20A', 'wcag21A'],
    'meta-viewport': ['wcag21AA'],
    'document-title': ['wcag20A', 'wcag21A'],
    'frame-title': ['wcag20A', 'wcag21A'],
  };

  calculateScore(
    issues: Array<Partial<AccessibilityIssue>>,
    baseLighthouseScore: number,
  ): ScoringResult {
    const issueBreakdown: IssueBreakdown = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    };

    const categoryPenalties: Record<keyof CategoryScores, number> = {
      perceivable: 0,
      operable: 0,
      understandable: 0,
      robust: 0,
    };

    const wcagFailures: Record<keyof WCAGCompliance, number> = {
      wcag20A: 0,
      wcag20AA: 0,
      wcag20AAA: 0,
      wcag21A: 0,
      wcag21AA: 0,
      wcag21AAA: 0,
    };

    let totalPenalty = 0;

    for (const issue of issues) {
      let penalty = 0;
      switch (issue.impact) {
        case 'CRITICAL':
          penalty = 15;
          issueBreakdown.critical++;
          break;
        case 'SERIOUS':
          penalty = 10;
          issueBreakdown.serious++;
          break;
        case 'MODERATE':
          penalty = 5;
          issueBreakdown.moderate++;
          break;
        case 'MINOR':
          penalty = 2;
          issueBreakdown.minor++;
          break;
      }

      totalPenalty += penalty;

      const ruleId = (issue as any).axeRuleId || (issue as any).ruleId || '';
      const categories = this.axeRuleToCategories[ruleId] || ['perceivable'];
      categories.forEach((cat) => {
        categoryPenalties[cat] += penalty;
      });

      const wcagCriteria = this.axeRuleToWCAG[ruleId] || [];
      wcagCriteria.forEach((wcag) => {
        wcagFailures[wcag as keyof WCAGCompliance]++;
      });
    }

    const clampScore = (score: number) => Math.max(0, Math.min(100, score));
    
    const categoryScores: CategoryScores = {
      perceivable: clampScore(100 - categoryPenalties.perceivable),
      operable: clampScore(100 - categoryPenalties.operable),
      understandable: clampScore(100 - categoryPenalties.understandable),
      robust: clampScore(100 - categoryPenalties.robust),
    };
    
    // Base : score Lighthouse si dispo, sinon moyenne des catégories
    const baseScore = baseLighthouseScore > 0 ? baseLighthouseScore :
      (categoryScores.perceivable + categoryScores.operable + categoryScores.understandable + categoryScores.robust) / 4;

    // On soustrait les pénalités des violations Axe : le score reflète les erreurs détectées.
    // (0 erreur → score = Lighthouse ; des erreurs → le score baisse en conséquence)
    const pageScore = clampScore(baseScore - totalPenalty);

    const wcagCompliance: WCAGCompliance = {
      wcag20A: wcagFailures.wcag20A === 0 ? 100 : clampScore(100 - wcagFailures.wcag20A * 10),
      wcag20AA: wcagFailures.wcag20AA === 0 ? 100 : clampScore(100 - wcagFailures.wcag20AA * 10),
      wcag20AAA: wcagFailures.wcag20AAA === 0 ? 100 : clampScore(100 - wcagFailures.wcag20AAA * 10),
      wcag21A: wcagFailures.wcag21A === 0 ? 100 : clampScore(100 - wcagFailures.wcag21A * 10),
      wcag21AA: wcagFailures.wcag21AA === 0 ? 100 : clampScore(100 - wcagFailures.wcag21AA * 10),
      wcag21AAA: wcagFailures.wcag21AAA === 0 ? 100 : clampScore(100 - wcagFailures.wcag21AAA * 10),
    };

    return {
      pageScore,
      categoryScores,
      wcagCompliance,
      issueBreakdown,
    };
  }
}
