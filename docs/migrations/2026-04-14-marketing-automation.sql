-- ============================================================================
-- Migration: marketing automation tables
-- Date: 2026-04-14
-- Track: M.1 — Marketing automation foundation
--
-- Backs the agentic marketing automation module (see
-- MARKETING-AUTOMATION-PLAN.md). Distinct from the Track C social_queue
-- which handles human-in-the-loop reply approval — these tables drive
-- AUTONOMOUS outbound content with a kill switch, not a per-post review
-- queue.
--
-- Tables created:
--   marketing_posts          — every drafted post (shadow or live)
--   marketing_voice_context  — loved/hated examples for few-shot prompt
--   marketing_topics_used    — append-only dedup log
--   marketing_engagement     — per-post engagement, polled daily 14d
--
-- Default state: SHADOW MODE on every platform. KV flags (separate
-- from this migration) gate live posting per platform.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- marketing_posts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_posts (
  id SERIAL PRIMARY KEY,

  -- Target platform. 'beehiiv' covered separately by existing daily-brief
  -- cron but logged here for unified analytics.
  platform TEXT NOT NULL CHECK (platform IN (
    'x', 'linkedin', 'substack', 'medium', 'threads', 'bluesky', 'beehiiv'
  )),

  -- Content pillar this post serves. NULL only allowed during bootstrap
  -- import; engine-generated rows always tag a pillar at draft time.
  pillar TEXT CHECK (pillar IN (
    'signal', 'pattern', 'methodology', 'product', 'context'
  )),

  -- Semantic key for topic dedup. Engine constructs from primary entities
  -- + event type + date bucket. Example: "iran-strikes-2026-04-13".
  topic_key TEXT,

  -- Entities (countries, orgs, named persons) referenced. Used for
  -- secondary dedup — even if topic_key differs, overlapping entity sets
  -- within 7 days suggest a duplicate angle.
  entity_keys TEXT[] DEFAULT '{}',

  -- Format taxonomy. 'thread' rows store a JSON array of tweets in
  -- content; everything else is a single string.
  format TEXT NOT NULL CHECK (format IN (
    'post', 'thread', 'longform', 'short'
  )),

  -- The drafted content. For thread format, JSON-encoded array.
  content TEXT NOT NULL,

  -- Platform-specific or generation-time metadata: source URLs, layer
  -- references, scheduled time hints, charts, parent campaign refs.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Lifecycle status:
  --   drafted    — generated, voice-evaluated, awaiting dispatch
  --   scheduled  — picked up by adapter, queued for posting
  --   posted     — confirmed posted to platform (or shadow-logged)
  --   failed     — dispatch attempted but platform errored
  --   suppressed — voice eval failed permanent rule (forbidden topic etc.)
  --   held       — voice score below threshold; needs human review
  status TEXT NOT NULL DEFAULT 'drafted' CHECK (status IN (
    'drafted', 'scheduled', 'posted', 'failed', 'suppressed', 'held'
  )),

  -- True iff generated under SHADOW mode. Posts in shadow mode never
  -- reach the live platform; the adapter logs platform_post_id with
  -- 'shadow:' prefix and proceeds.
  shadow_mode BOOLEAN NOT NULL DEFAULT TRUE,

  -- Voice eval results from /api/voice/eval at draft time.
  voice_score INTEGER,
  voice_violations TEXT[] DEFAULT '{}',

  -- For derivative posts in a content waterfall — the source long-form
  -- post that spawned this derivative. NULL for original posts.
  parent_post_id INTEGER REFERENCES marketing_posts(id) ON DELETE SET NULL,

  -- Dispatcher schedule and outcome.
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  platform_post_id TEXT,
  platform_url TEXT,
  platform_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary admin query: most recent posts across platforms.
CREATE INDEX IF NOT EXISTS idx_marketing_posts_created
  ON marketing_posts (created_at DESC);

-- Per-platform recent posts.
CREATE INDEX IF NOT EXISTS idx_marketing_posts_platform_created
  ON marketing_posts (platform, created_at DESC);

-- Status-driven dispatcher pull.
CREATE INDEX IF NOT EXISTS idx_marketing_posts_status_scheduled
  ON marketing_posts (status, scheduled_at);

-- Pillar analytics.
CREATE INDEX IF NOT EXISTS idx_marketing_posts_pillar_created
  ON marketing_posts (pillar, created_at DESC);

-- Cascade waterfall lookup.
CREATE INDEX IF NOT EXISTS idx_marketing_posts_parent
  ON marketing_posts (parent_post_id) WHERE parent_post_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- marketing_voice_context
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_voice_context (
  id SERIAL PRIMARY KEY,

  -- Platform scope. 'all' for cross-platform examples (e.g. forbidden
  -- patterns); platform-specific for per-platform tone exemplars.
  platform TEXT NOT NULL DEFAULT 'all' CHECK (platform IN (
    'all', 'x', 'linkedin', 'substack', 'medium', 'threads', 'bluesky', 'beehiiv'
  )),

  -- Curation category:
  --   loved    — exemplary; engine should emulate this voice/structure
  --   hated    — never-do-this; engine should pattern-avoid
  --   neutral  — acceptable but not exemplary; reference only
  category TEXT NOT NULL CHECK (category IN ('loved', 'hated', 'neutral')),

  -- The example text.
  content TEXT NOT NULL,

  -- Why it's loved/hated/neutral. Surfaced in the prompt to teach the
  -- engine the underlying principle, not just the surface example.
  notes TEXT,

  -- Audit.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_marketing_voice_context_platform_category
  ON marketing_voice_context (platform, category, created_at DESC);


-- ----------------------------------------------------------------------------
-- marketing_topics_used
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_topics_used (
  id SERIAL PRIMARY KEY,
  topic_key TEXT NOT NULL,
  entity_keys TEXT[] NOT NULL DEFAULT '{}',
  platform TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  post_id INTEGER REFERENCES marketing_posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_marketing_topics_used_topic_posted
  ON marketing_topics_used (topic_key, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_topics_used_posted
  ON marketing_topics_used (posted_at DESC);


-- ----------------------------------------------------------------------------
-- marketing_engagement
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_engagement (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES marketing_posts(id) ON DELETE CASCADE,
  polled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Universal metrics. Platforms map their native names to these.
  impressions INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  reposts INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,

  -- Sales-signal metric. Replies/comments from profiles whose bio
  -- matches the intel-buyer regex (analyst, researcher, PM, fund,
  -- newsroom, policy, geopolitics). Weighted 5x in voice-learn loop.
  intel_buyer_signal INTEGER NOT NULL DEFAULT 0,

  -- Platform-specific raw data for forensics.
  raw_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_marketing_engagement_post_polled
  ON marketing_engagement (post_id, polled_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_engagement_polled
  ON marketing_engagement (polled_at DESC);
