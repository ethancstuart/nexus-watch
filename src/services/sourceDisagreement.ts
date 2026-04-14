/**
 * Source Disagreement Detection
 *
 * When independent sources contradict each other on a signal, that's
 * a CONTESTED event — and it's genuinely important intel. NexusWatch
 * surfaces these instead of silently picking one side.
 *
 * Examples:
 * - GDELT tone is positive but ACLED shows active conflict events
 * - Polymarket odds low on escalation but news sentiment very negative
 * - One news source says "ceasefire" another says "escalation"
 */

import { getCachedCII } from './countryInstabilityIndex.ts';

export interface Contradiction {
  id: string;
  countryCode: string;
  countryName: string;
  /** Short label. */
  summary: string;
  /** The disagreeing sources. */
  sides: Array<{
    source: string;
    signal: string;
    valence: 'positive' | 'neutral' | 'negative';
  }>;
  /** Detected at. */
  detectedAt: number;
}

let contradictions: Contradiction[] = [];

export function getContradictions(): Contradiction[] {
  return contradictions;
}

export function getContradictionsForCountry(code: string): Contradiction[] {
  return contradictions.filter((c) => c.countryCode === code);
}

export function runDisagreementDetection(layerData: Map<string, unknown>): Contradiction[] {
  const newContradictions: Contradiction[] = [];

  const news = layerData.get('news') as Array<{ country?: string; tone?: number; title?: string }> | undefined;
  const acled = layerData.get('acled') as
    | Array<{ country?: string; fatalities?: number; event_type?: string }>
    | undefined;
  const predictions = layerData.get('predictions') as
    | Array<{ question?: string; probability?: number; country?: string }>
    | undefined;

  const ciiScores = getCachedCII();
  let idCounter = 0;

  for (const cii of ciiScores) {
    // Only check countries with meaningful activity
    if (cii.score < 30 && cii.tier !== 'core') continue;

    // GDELT positive tone vs ACLED active conflict
    const countryNews = news?.filter(
      (n) => n.country && (n.country.includes(cii.countryName) || n.country === cii.countryCode),
    );
    const countryAcled = acled?.filter(
      (a) => a.country && (a.country.includes(cii.countryName) || a.country === cii.countryCode),
    );

    if (countryNews && countryAcled) {
      const avgTone =
        countryNews.length > 0 ? countryNews.reduce((s, n) => s + (n.tone || 0), 0) / countryNews.length : null;
      const fatalities = countryAcled.reduce((s, a) => s + (a.fatalities || 0), 0);

      if (avgTone !== null && avgTone > 2 && fatalities > 20) {
        newContradictions.push({
          id: `cd-${Date.now()}-${++idCounter}`,
          countryCode: cii.countryCode,
          countryName: cii.countryName,
          summary: `GDELT shows positive tone (${avgTone.toFixed(1)}) but ACLED reports ${fatalities} fatalities`,
          sides: [
            {
              source: 'GDELT',
              signal: `avg tone ${avgTone.toFixed(1)} (positive)`,
              valence: 'positive',
            },
            {
              source: 'ACLED',
              signal: `${fatalities} fatalities, ${countryAcled.length} events`,
              valence: 'negative',
            },
          ],
          detectedAt: Date.now(),
        });
      }
    }

    // CII high but Polymarket odds low on escalation
    if (predictions && cii.score >= 70) {
      const escalationMarkets = predictions.filter(
        (p) =>
          p.country &&
          (p.country.includes(cii.countryName) || p.country === cii.countryCode) &&
          p.question &&
          /escalat|invas|attack|war/i.test(p.question),
      );
      if (escalationMarkets.length > 0) {
        const avgOdds = escalationMarkets.reduce((s, p) => s + (p.probability || 0), 0) / escalationMarkets.length;
        if (avgOdds < 0.2) {
          newContradictions.push({
            id: `cd-${Date.now()}-${++idCounter}`,
            countryCode: cii.countryCode,
            countryName: cii.countryName,
            summary: `CII ${cii.score} suggests high risk but prediction markets price escalation at ${Math.round(avgOdds * 100)}%`,
            sides: [
              {
                source: 'NexusWatch CII',
                signal: `Score ${cii.score} (high risk)`,
                valence: 'negative',
              },
              {
                source: 'Polymarket',
                signal: `${Math.round(avgOdds * 100)}% escalation odds`,
                valence: 'positive',
              },
            ],
            detectedAt: Date.now(),
          });
        }
      }
    }
  }

  contradictions = newContradictions;
  return newContradictions;
}
