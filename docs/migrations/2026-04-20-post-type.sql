-- 2026-04-20: add post_type to marketing_posts
-- Non-breaking: existing rows get NULL (pre-type-system)
ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS post_type TEXT;
