-- Social image support (D-5, D-7, 2026-04-18)
-- Adds image_url columns to marketing_posts and social_queue tables
-- for visual social content via /api/og/social card generator.

ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE social_queue ADD COLUMN IF NOT EXISTS image_url TEXT;
