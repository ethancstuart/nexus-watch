# NexusWatch — Launch Playbook

Everything you need to make launch day go right. This is the file you
open the morning of, work down, and don't deviate from.

## Files

- [`day-of-timeline.md`](./day-of-timeline.md) — hour-by-hour script
- [`hn-post.md`](./hn-post.md) — Hacker News submission copy
- [`reddit-posts.md`](./reddit-posts.md) — r/geopolitics, r/dataisbeautiful, r/SideProject
- [`producthunt.md`](./producthunt.md) — Product Hunt submission
- [`linkedin.md`](./linkedin.md) — Ethan's launch post + 3 follow-ups
- [`twitter-thread.md`](./twitter-thread.md) — 9-tweet launch thread
- [`beehiiv-launch-issue.md`](./beehiiv-launch-issue.md) — special launch brief
- [`tracking.md`](./tracking.md) — what to measure, where it lives
- [`troubleshooting.md`](./troubleshooting.md) — rollback playbook if something breaks

## Pre-flight checklist (T-7 days)

- [ ] All cron jobs running successfully (check `/api/status`)
- [ ] Daily brief cron has produced at least 3 days of real briefs
- [ ] Twitter, LinkedIn, beehiiv accounts active
- [ ] HN account aged >30 days, ≥3 karma
- [ ] Stripe still in test mode? Either go-live (`docs/runbooks/stripe-go-live.md`) or stay test until post-launch
- [ ] Privacy + Terms + Security pages reviewed
- [ ] OG image renders correctly (`/api/og?title=NexusWatch`)
- [ ] First-visit aha moment renders for new users
- [ ] Cinema mode walked-through on a real wall display

## Pre-flight checklist (T-1 day)

- [ ] DNS pointing at Vercel correctly (`dig nexuswatch.dev`)
- [ ] Production deploy succeeds with no warnings
- [ ] Discord alert webhook firing successfully
- [ ] Briefing the cron monitor — no failures in the last 24h
- [ ] Stripe webhook signature verified (if going live)
- [ ] Set up uptimerobot.com or similar for offsite ping

## Day of (T-0)

Follow [`day-of-timeline.md`](./day-of-timeline.md) hour-by-hour.

## After launch (T+1 to T+7)

- Daily check on /api/status, follower counts, brief subscribe rate
- Reply to every HN comment (the second 24h matters as much as the first)
- Send T+3 follow-up to anyone who subscribed but hasn't opened a brief
- T+7: write a "what we learned" retrospective publicly

## Don't break this on launch day

- Don't push code changes during the launch window unless rolling back
- Don't change Stripe configuration
- Don't change the OG image
- Don't merge to main without watching CI to green
