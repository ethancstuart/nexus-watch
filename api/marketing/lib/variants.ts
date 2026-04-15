/**
 * variants.ts — A/B prompt-variant selection + auto-promotion
 *
 * Reads marketing_prompt_variants filtered to the current platform+pillar,
 * weighted-picks one, and returns the prompt suffix + variant id to append
 * to the voice system prompt. The dispatcher records `variant_id` onto
 * marketing_posts so the promotion cron can later compute the winner.
 *
 * Returning null means "no active experiment for this scope" — caller
 * should fall through to baseline prompt.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NeonSql = any;

import type { Platform } from './flags';
import type { Pillar } from './config';

export interface VariantPick {
  id: number;
  experiment_key: string;
  label: string;
  prompt_suffix: string;
}

interface VariantRow {
  id: number;
  experiment_key: string;
  label: string;
  prompt_suffix: string;
  weight: number;
  is_control: boolean;
  status: string;
  platform: string | null;
  pillar: string | null;
}

/**
 * Pick a variant for a (platform, pillar) pair using weighted random sampling.
 * Experiments are keyed by experiment_key — within an experiment, weights
 * are normalized to 1.0 before sampling.
 *
 * If multiple experiments match the scope, we pick the first experiment
 * (by alphabetical key) to avoid concurrent-experiment interference — that
 * is intentional: the admin is expected to run one experiment per scope
 * at a time. The UI surfaces a warning if overlapping experiments exist.
 */
export async function pickVariant(sql: NeonSql, platform: Platform, pillar: Pillar): Promise<VariantPick | null> {
  const rows = (
    await sql`
    SELECT id, experiment_key, label, prompt_suffix, weight, is_control, status, platform, pillar
    FROM marketing_prompt_variants
    WHERE status = 'running'
      AND (platform IS NULL OR platform = ${platform})
      AND (pillar   IS NULL OR pillar   = ${pillar})
  `
  ).catch(() => [] as unknown) as VariantRow[];

  if (!Array.isArray(rows) || rows.length === 0) return null;

  // Group by experiment_key; pick the first experiment alphabetically for determinism.
  const groups = new Map<string, VariantRow[]>();
  for (const r of rows) {
    const list = groups.get(r.experiment_key) ?? [];
    list.push(r);
    groups.set(r.experiment_key, list);
  }
  const sortedKeys = [...groups.keys()].sort();
  const pick = groups.get(sortedKeys[0]);
  if (!pick || pick.length === 0) return null;

  // Normalize weights; fall back to equal weights if all zero.
  const total = pick.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (total <= 0) {
    const chosen = pick[Math.floor(Math.random() * pick.length)];
    return {
      id: chosen.id,
      experiment_key: chosen.experiment_key,
      label: chosen.label,
      prompt_suffix: chosen.prompt_suffix,
    };
  }
  const r = Math.random() * total;
  let acc = 0;
  for (const v of pick) {
    acc += Math.max(0, v.weight);
    if (r <= acc) {
      return {
        id: v.id,
        experiment_key: v.experiment_key,
        label: v.label,
        prompt_suffix: v.prompt_suffix,
      };
    }
  }
  const fallback = pick[pick.length - 1];
  return {
    id: fallback.id,
    experiment_key: fallback.experiment_key,
    label: fallback.label,
    prompt_suffix: fallback.prompt_suffix,
  };
}

export interface PromoteSummary {
  experiments_checked: number;
  experiments_promoted: number;
  winners: Array<{ experiment_key: string; winning_label: string; margin: number }>;
  skipped: Array<{ experiment_key: string; reason: string }>;
}

/**
 * Run one pass of auto-promotion across all running experiments.
 * Call from api/cron/marketing-abtest-promote.ts (weekly or daily).
 *
 * Promotion gates:
 *   - Experiment has ≥ 14 days of wall time since started_at
 *   - Every variant has ≥ 10 live (non-shadow) posts
 *   - A clear winner exists (highest mean composite score; margin ≥ 5%)
 *
 * On promotion: winning variant → status='winner' with weight=1.0.
 * Losing variants → status='retired' + retired_at=NOW().
 * Notes column on winner carries the margin + counts for audit.
 */
export async function promoteWinners(sql: NeonSql): Promise<PromoteSummary> {
  const summary: PromoteSummary = {
    experiments_checked: 0,
    experiments_promoted: 0,
    winners: [],
    skipped: [],
  };

  const experiments = (await sql`
    SELECT DISTINCT experiment_key
    FROM marketing_prompt_variants
    WHERE status = 'running'
  `) as unknown as Array<{ experiment_key: string }>;

  for (const { experiment_key } of experiments) {
    summary.experiments_checked++;

    const variants = (await sql`
      SELECT id, label, started_at, is_control, weight
      FROM marketing_prompt_variants
      WHERE experiment_key = ${experiment_key} AND status = 'running'
    `) as unknown as Array<{ id: number; label: string; started_at: string; is_control: boolean; weight: number }>;
    if (variants.length < 2) {
      summary.skipped.push({ experiment_key, reason: 'fewer_than_2_running' });
      continue;
    }

    const minStarted = new Date(Math.min(...variants.map((v) => Date.parse(v.started_at)))).toISOString();
    const daysElapsed = (Date.now() - Date.parse(minStarted)) / 86400000;
    if (daysElapsed < 14) {
      summary.skipped.push({ experiment_key, reason: `window_${daysElapsed.toFixed(1)}d<14d` });
      continue;
    }

    // Score each variant: mean composite engagement across its live posts.
    const scores: Array<{ id: number; label: string; n: number; mean: number }> = [];
    for (const v of variants) {
      const rows = (await sql`
        SELECT
          COUNT(*)::int AS n,
          COALESCE(AVG(
            COALESCE(e.impressions, 0) * 1
            + COALESCE(e.likes, 0) * 2
            + COALESCE(e.reposts, 0) * 5
            + COALESCE(e.replies, 0) * 3
            + COALESCE(e.intel_buyer_signal, 0) * 5
          ), 0)::float AS mean_score
        FROM marketing_posts p
        LEFT JOIN LATERAL (
          SELECT impressions, likes, reposts, replies, intel_buyer_signal
          FROM marketing_engagement
          WHERE post_id = p.id
          ORDER BY polled_at DESC
          LIMIT 1
        ) e ON TRUE
        WHERE p.variant_id = ${v.id}
          AND p.shadow_mode = FALSE
          AND p.status = 'posted'
      `) as unknown as Array<{ n: number; mean_score: number }>;
      scores.push({ id: v.id, label: v.label, n: rows[0]?.n ?? 0, mean: rows[0]?.mean_score ?? 0 });
    }

    if (scores.some((s) => s.n < 10)) {
      summary.skipped.push({
        experiment_key,
        reason: `insufficient_posts_${scores.map((s) => `${s.label}=${s.n}`).join(',')}`,
      });
      continue;
    }

    scores.sort((a, b) => b.mean - a.mean);
    const winner = scores[0];
    const runnerUp = scores[1];
    const margin = runnerUp.mean === 0 ? 1 : (winner.mean - runnerUp.mean) / runnerUp.mean;
    if (margin < 0.05) {
      summary.skipped.push({ experiment_key, reason: `margin_${(margin * 100).toFixed(1)}%<5%` });
      continue;
    }

    const note = `auto-promoted ${new Date().toISOString()} — winner=${winner.label} mean=${winner.mean.toFixed(1)} vs ${runnerUp.label} mean=${runnerUp.mean.toFixed(1)} (margin ${(margin * 100).toFixed(1)}%)`;
    await sql`
      UPDATE marketing_prompt_variants
      SET status = 'winner', weight = 1.0, notes = ${note}
      WHERE id = ${winner.id}
    `;
    await sql`
      UPDATE marketing_prompt_variants
      SET status = 'retired', weight = 0, retired_at = NOW(),
          notes = ${`auto-retired ${new Date().toISOString()} — lost to ${winner.label}`}
      WHERE experiment_key = ${experiment_key}
        AND status = 'running'
        AND id <> ${winner.id}
    `;

    summary.experiments_promoted++;
    summary.winners.push({ experiment_key, winning_label: winner.label, margin });
  }

  return summary;
}
