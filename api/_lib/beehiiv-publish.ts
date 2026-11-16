/**
 * Publish the daily brief to beehiiv as a draft.
 *
 * Lifted out of api/cron/daily-brief.ts so the request path can be tested
 * with `fetch` stubbed; the behaviour on a good id is unchanged. What is new
 * is what happens on a bad one: the configuration is checked FIRST, no request
 * is sent for a malformed id, and the fault is raised as a keyed alert that
 * names the variable actually at fault — instead of a console line naming a
 * variable that did not exist, quoting part of the value, and nobody reading
 * it for four months (brief_delivery_log, 2026-07-09 onward).
 */
import { clearAlert, raiseAlert } from './alert.js';
import {
  BEEHIIV_ALERT_KEY_ADVISORY,
  BEEHIIV_ALERT_KEY_BLOCKED,
  BEEHIIV_CANONICAL_VAR,
  beehiivConfigAlert,
  describeBeehiivIssues,
  resolveBeehiivPublicationId,
  type BeehiivIdResolution,
} from './beehiiv-config.js';
import { CONFIG_FAULT_ERROR_PREFIX } from './delivery-health.js';

export interface BeehiivDeliveryRow {
  channel: 'beehiiv';
  status: 'success' | 'failed' | 'partial';
  error?: string;
  latencyMs: number;
  metadata?: Record<string, unknown>;
}

export interface PublishToBeehiivInput {
  today: string;
  briefText: string;
  /** Inner modules only; beehiiv wraps them in its own masthead and footer. */
  contentHtml: string;
  logDelivery: (row: BeehiivDeliveryRow) => Promise<void>;
}

/**
 * Surface configuration issues. Returns true when a person has been told —
 * the alert was delivered, or deduplicated against one that was. A rejected
 * send is not "told".
 *
 * The brief runs once a day and ALERT_REMINDER_HOURS is 6, so a standing fault
 * is one email on the first run and then one reminder per daily run: a daily
 * email until fixed, not one per hour, and an all-clear when it clears.
 */
async function reportConfig(resolution: BeehiivIdResolution): Promise<boolean> {
  for (const line of describeBeehiivIssues(resolution)) {
    const log = line.includes('whitespace') ? console.warn : console.error;
    log(`[daily-brief] beehiiv config: ${line}`);
  }
  const alert = beehiivConfigAlert(resolution);
  // TOLD means a person actually has it: delivered now, or deduplicated
  // against an earlier delivery (a failed send gives its claim back, so
  // 'suppressed' implies a prior success). A send that was REJECTED still
  // names a channel (Resend 500 -> channel 'email', delivered false), so the
  // channel alone proves nothing. Getting this wrong marks the row as owned
  // and stands the streak alert down with nobody told.
  let told = false;
  if (alert) {
    const result = await raiseAlert(alert);
    told = result.delivered || result.channel === 'suppressed';
  }
  // Stand down whichever condition is no longer present. clearAlert is silent
  // unless a person had been told about it.
  for (const key of [BEEHIIV_ALERT_KEY_BLOCKED, BEEHIIV_ALERT_KEY_ADVISORY]) {
    if (key !== alert?.key) await clearAlert(key, 'The beehiiv publication id is configured correctly again.');
  }
  return told;
}

export async function publishToBeehiiv(input: PublishToBeehiivInput): Promise<void> {
  const { today, briefText, contentHtml, logDelivery } = input;
  const beehiivKey = process.env.BEEHIIV_API_KEY;
  // Not configured at all is a legitimate state — someone who does not use
  // beehiiv. Stay silent, as before.
  if (!beehiivKey) return;
  const resolution = resolveBeehiivPublicationId();
  if (!resolution.configured) return;

  const beehiivT0 = Date.now();
  const told = await reportConfig(resolution);

  const beehiivPubId = resolution.id;
  if (!beehiivPubId) {
    // A malformed id earns an opaque 400 from beehiiv, so do not ask it.
    const faults = describeBeehiivIssues(resolution).join('; ');
    const msg = `${faults}. Set ${BEEHIIV_CANONICAL_VAR}. No request was sent.`;
    await logDelivery({
      channel: 'beehiiv',
      status: 'failed',
      error: told ? `${CONFIG_FAULT_ERROR_PREFIX} ${msg}` : msg,
      latencyMs: Date.now() - beehiivT0,
    });
    return;
  }

  try {
    // Extract Good Morning line for subtitle. The ledger line is spliced
    // into the FIRST section (see spliceLedgerLine), which on Sundays is
    // Good Morning — strip it here or the subtitle becomes the stat line
    // instead of the greeting. Caught by the rule-2 review of the splice
    // change; the greeting, not the record, is the subtitle's job.
    const subtitleMatch = briefText.match(/## ☕ Good Morning\n+([\s\S]*?)(?=\n##|\n\n##)/);
    const subtitle = subtitleMatch
      ? subtitleMatch[1]
          .replace(/^\*\*The Ledger\*\*.*$/m, '')
          .trim()
          .slice(0, 200)
      : `Your daily geopolitical intelligence scan — ${today}`;

    const beehiivRes = await fetch(`https://api.beehiiv.com/v2/publications/${beehiivPubId}/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${beehiivKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `The NexusWatch Brief — ${today}`,
        subtitle,
        // Light Intel Dossier inner modules. beehiiv wraps with its own
        // masthead/footer/unsubscribe chrome, so we ship just the content.
        content_html: contentHtml,
        // 'draft' works on all beehiiv plans. 'confirmed' + send_to requires Enterprise.
        // Drafts appear in beehiiv dashboard for review + manual send.
        // To auto-send: upgrade beehiiv to Enterprise and change to status: 'confirmed', send_to: 'all'.
        status: 'draft',
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!beehiivRes.ok) {
      const body = await beehiivRes.text().catch(() => '');
      // beehiiv POST API requires Enterprise plan. Log and skip gracefully.
      if (beehiivRes.status === 403) {
        console.log(
          '[daily-brief] beehiiv API requires Enterprise plan — skipping. Brief delivered via other channels.',
        );
        await logDelivery({
          channel: 'beehiiv',
          status: 'partial',
          latencyMs: Date.now() - beehiivT0,
          metadata: { reason: 'enterprise_plan_required' },
        });
      } else {
        throw new Error(`beehiiv ${beehiivRes.status}: ${body.slice(0, 200)}`);
      }
    }

    // Parse post ID for traceability — not fatal if the shape changes.
    let postId: string | undefined;
    try {
      const beehiivData = (await beehiivRes.json()) as { data?: { id?: string } };
      postId = beehiivData.data?.id;
    } catch {
      /* ignore parse errors */
    }

    await logDelivery({
      channel: 'beehiiv',
      status: 'success',
      latencyMs: Date.now() - beehiivT0,
      metadata: { post_id: postId, subtitle_length: subtitle.length },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[daily-brief] beehiiv publish failed:', msg);
    await logDelivery({
      channel: 'beehiiv',
      status: 'failed',
      error: msg,
      latencyMs: Date.now() - beehiivT0,
    });
  }
}
