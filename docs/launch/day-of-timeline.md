# Day-of Launch — Hour-by-Hour Script

All times in your local timezone. Adjust if you want HN to land at peak
US-Pacific morning (recommended: 8:30 AM PT / 11:30 AM ET / 4:30 PM
UTC, weekday Tuesday-Thursday).

## T-1 hour: Final smoke

- Open https://nexuswatch.dev on a fresh browser (incognito)
- Click through: landing → Open dashboard → click 3 countries → open
  CCTV → open a brief
- Hit https://nexuswatch.dev/api/status — overall health = ok
- Check Discord for any alert in the last hour

## T+0:00 — HN post

Submit at https://news.ycombinator.com/submit
- Title: see [`hn-post.md`](./hn-post.md)
- URL: `https://nexuswatch.dev`
- Set a 5-minute reminder to come back and post the first comment

## T+0:05 — First HN comment

Post the "Show HN, here's what's interesting" comment from
[`hn-post.md`](./hn-post.md). HN's algorithm rewards activity in the
first 30 minutes.

## T+0:10 — LinkedIn

Post the launch announcement from [`linkedin.md`](./linkedin.md) on
your personal feed. Tag any operators / journalists you've talked to.

## T+0:15 — Twitter thread

Post the 9-tweet thread from [`twitter-thread.md`](./twitter-thread.md).
Pin the first tweet to your profile.

## T+0:30 — Reddit

Post to r/geopolitics first (most aligned audience). Wait 15 minutes,
then r/dataisbeautiful with a different angle. Don't spam r/SideProject
the same hour.

See [`reddit-posts.md`](./reddit-posts.md) for the per-sub copy.

## T+1:00 — Product Hunt

Schedule for the upcoming midnight PT (PH resets at 12:01 AM PT). Use
[`producthunt.md`](./producthunt.md). The maker comment is the most
important.

## T+2:00 — beehiiv special issue

Send the launch issue from [`beehiiv-launch-issue.md`](./beehiiv-launch-issue.md)
to your existing list. Different framing than the social posts:
focuses on the "we shipped" moment.

## T+4:00 — Reply pass

Open all four channels (HN, Reddit, LinkedIn, Twitter) and reply to
every reply. Even single-word ones. Engagement begets engagement.

## T+8:00 — Sanity check

- /api/status still ok
- No Discord alerts
- No 5xx in Vercel logs
- HN ranking ≥ #30 (if not, the post died — that's fine, the rest of
  the channels carry it)
- Subscribers from beehiiv? Should see ≥10 new ones if any of the
  channels worked

## T+24:00 — Day-after

- Close the loop on every reply that came in overnight
- Send a thank-you note to anyone who explicitly amplified
- Capture all metrics in [`tracking.md`](./tracking.md)
- Decide: if traction is real, plan a follow-up post for T+7. If not,
  treat it as a soft launch and iterate.

## What success looks like

- HN: front page (top 30) for 4+ hours
- Reddit: top of /new in r/geopolitics
- LinkedIn: 50+ reactions, 5+ comments
- beehiiv: +50 subscribers
- Vercel logs: 0 5xx during peak

If you hit half of those, it was a successful launch. Below that,
the channels weren't ready and the next attempt should focus on
distribution prep (warm intros, partnerships) before relaunching.
