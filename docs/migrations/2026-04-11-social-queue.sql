-- ============================================================================
-- Migration: social_queue + social_actions
-- Date: 2026-04-11
-- Track: C.1 — Social drafting queue infrastructure
--
-- Backs the permanent human-in-the-loop approval queue for NexusWatch's
-- social drafting engine. Track C's architectural invariant is that the
-- engine drafts 24/7 but NOTHING ships to X/LinkedIn/Reddit without
-- explicit human approval — these two tables are where drafts wait and
-- where every transition is audited.
--
-- `social_queue` holds one row per drafted social action. Statuses:
--   pending   — draft just landed from an engine, awaiting review
--   approved  — reviewer approved; send worker (C.2+) will POST to platform
--   sent      — send worker confirmed a platform_post_id returned
--   rejected  — reviewer declined; row stays for audit
--   held      — reviewer flagged for follow-up but hasn't decided; can
--               transition back to pending/approved/rejected later
--   retracted — sent, then rolled back via delete+apologize workflow
--
-- `social_actions` is the append-only audit log. One row per state
-- transition + one row per retraction/apology action. Never updated,
-- only inserted. This is the forensics surface if anything goes wrong
-- on a platform — every single change is replayable from this table.
--
-- IMPORTANT: the send worker that transitions approved → sent is NOT
-- in Track C.1. This migration + the admin approve/reject endpoint ship
-- the queue scaffolding only. C.2-C.4 add the per-platform drafting
-- agents, C.5 adds the send worker, C.7 adds the feedback loop that
-- clusters reviewer edits into voice spec updates.
-- ============================================================================

CREATE TABLE IF NOT EXISTS social_queue (
  id SERIAL PRIMARY KEY,

  -- Platform the drafted action targets. One of:
  --   'x'        — X/Twitter reply, thread, DM, or standalone post
  --   'linkedin' — LinkedIn post or reply (no DMs — higher reputation risk)
  --   'reddit'   — Subreddit post or comment on our own thread
  --   'dm'       — cross-platform inbound DM response (currently X only)
  platform TEXT NOT NULL CHECK (platform IN ('x', 'linkedin', 'reddit', 'dm')),

  -- Action type classification. Lets the reviewer scan by type.
  -- 'reply'   — response to an incoming mention/comment/DM
  -- 'post'    — standalone outbound post (brief repurposing, tool-of-week, etc.)
  -- 'thread'  — multi-tweet thread (X daily brief thread is the canonical case)
  -- 'comment' — comment on our own post (usually engagement-priming a thread)
  action_type TEXT NOT NULL CHECK (action_type IN ('reply', 'post', 'thread', 'comment')),

  -- What triggered this draft. Free-text context for the reviewer.
  -- Examples: "mention from @rob_lee re Red Sea brief", "daily X thread
  -- scheduled 5:15 AM ET", "comment on our r/geopolitics post about Iran"
  source TEXT,

  -- URL of the source item the draft is responding to, when applicable.
  -- Lets the reviewer click through to see the full context on the
  -- platform before deciding.
  source_url TEXT,

  -- The draft itself. This is what the engine generated. Never edited
  -- directly — if a reviewer wants to tweak it, they set `final_content`
  -- instead so the original is preserved in the audit trail.
  draft_content TEXT NOT NULL,

  -- Engine's reasoning for why this draft was generated. Shown in the
  -- review UI as a "why am I seeing this" tag. E.g., "scored 92 on voice
  -- eval; mention contains geopolitical content; author engagement score
  -- 3.2 in last 7 days".
  rationale TEXT,

  -- Voice eval score from /api/voice/eval at drafting time, 0-100.
  -- NULL means the draft was generated without passing through the eval
  -- (shouldn't happen in production but is permitted for bootstrap rows).
  voice_score INTEGER,

  -- State machine. See the header comment for the status taxonomy.
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'sent', 'rejected', 'held', 'retracted')),

  -- Reviewer identification. Populated on transition out of 'pending'.
  -- Admin email or KV session id — whatever resolveAdmin() returned.
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,

  -- Platform send metadata. Populated only when status moves to 'sent'.
  sent_at TIMESTAMPTZ,
  platform_post_id TEXT,
  platform_error TEXT,

  -- Reviewer's edit, if they changed the draft before approving. If
  -- NULL, the send worker uses `draft_content` as-is. The comparison
  -- of `draft_content` vs `final_content` is the edit_delta that the
  -- Track C.7 feedback loop clusters into voice spec updates.
  final_content TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary review query: "show me pending drafts newest first"
CREATE INDEX IF NOT EXISTS idx_social_queue_status_created
  ON social_queue (status, created_at DESC);

-- Per-platform dashboards
CREATE INDEX IF NOT EXISTS idx_social_queue_platform_status
  ON social_queue (platform, status, created_at DESC);

-- Rate-limit check: "how many drafts has platform X produced in the
-- last N hours" — the enqueue endpoint uses this to enforce draft caps.
CREATE INDEX IF NOT EXISTS idx_social_queue_platform_created
  ON social_queue (platform, created_at DESC);

-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS social_actions (
  id SERIAL PRIMARY KEY,

  -- Queue row this action was taken on. Foreign key to social_queue.id.
  queue_id INTEGER NOT NULL REFERENCES social_queue(id) ON DELETE CASCADE,

  -- What the reviewer/system did. Mirrors the transition verbs so the
  -- audit log reads chronologically.
  --   'enqueue'  — initial draft landed
  --   'approve'  — pending → approved
  --   'reject'   — pending → rejected
  --   'hold'     — pending → held
  --   'unhold'   — held → pending
  --   'send'     — approved → sent (written by send worker)
  --   'retract'  — sent → retracted (delete+apologize flow)
  --   'edit'     — reviewer edited final_content before approval
  action TEXT NOT NULL CHECK (action IN ('enqueue', 'approve', 'reject', 'hold', 'unhold', 'send', 'retract', 'edit')),

  -- Who took the action. 'system' for automated transitions (enqueue,
  -- send); admin email/id for human reviewer actions.
  actor TEXT NOT NULL,

  -- State machine transition details. Useful for forensics when
  -- something went wrong.
  from_status TEXT,
  to_status TEXT,

  -- Optional reviewer note. Free-text context the reviewer typed when
  -- approving/rejecting. Also where the C.7 feedback loop will record
  -- the auto-clustered drift category.
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary audit query: "show me everything that happened to this draft"
CREATE INDEX IF NOT EXISTS idx_social_actions_queue_created
  ON social_actions (queue_id, created_at ASC);

-- Cross-draft actor queries: "show me everything a specific reviewer
-- did in the last N days" for post-incident review
CREATE INDEX IF NOT EXISTS idx_social_actions_actor_created
  ON social_actions (actor, created_at DESC);
