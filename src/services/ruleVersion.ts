/**
 * CII Rule Versioning
 *
 * Every CII computation logs which version of the rules produced it.
 * This lets us answer: "How was this score computed? Under which rule
 * set? What would it have been under version X?"
 *
 * Semantic versioning:
 *   MAJOR — component weights change (20% → 25%), scale changes, etc.
 *   MINOR — new baseline values added, new data sources wired in
 *   PATCH — bug fixes that don't change the score meaning
 *
 * Bump version when rules change. Never silently change scoring.
 */

export const CII_RULE_VERSION = '2.1.0';

export const CII_RULE_CHANGELOG = [
  {
    version: '2.1.0',
    date: '2026-04-14',
    changes: [
      'Added Iran (IR) conflict baseline (was missing)',
      'Raised Israel/Lebanon/NK/Taiwan conflict baselines to reflect current situation',
      'Added BASELINE_GOVERNANCE for 19 authoritarian/fragile states',
      'Added BASELINE_SENTIMENT for 17 war-zone countries',
      'Sentiment now uses max(baseline, live) floor',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-04-13',
    changes: [
      'Expanded from 23 to 86 monitored countries',
      '3-tier coverage system (core/extended/monitor)',
      'Evidence chain tracking per CII component',
      'Confidence scoring system',
      'Verification engine integration',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-04-08',
    changes: ['Initial 6-component CII model', '23 core countries monitored', 'Static market exposure weights'],
  },
];
