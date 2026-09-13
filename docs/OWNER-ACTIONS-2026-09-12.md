# Owner actions after the 2026-09-12 audit

Everything here needs you. Nothing here can be done from the repo alone.

Ordered by urgency. Each step says what to do, where, and how to check it worked.

**Time estimate:** steps 1–3 are about 25 minutes total. Steps 4–8 are decisions,
and each one has a "tell Claude" line that hands the work back to me once you have
decided.

---

## 1. Rotate the Mapbox token — 10 minutes, do this first

**Why.** `/api/brief/screenshot` served `access_token=<your token>` in a public
redirect header to every email client, image proxy and social crawler that ever
loaded a brief image. The leak is fixed and deployed, but the token that leaked is
still valid.

1. Go to <https://account.mapbox.com/access-tokens/>.
2. Find the token currently in use. It starts `pk.eyJ1IjoiZXRoYW5jc3R1Y…`.
3. Click **Create a token** instead of editing that one:
   - Name: `nexuswatch-static-images`
   - Scopes: tick **styles:tiles** and **styles:read** only.
   - Under **Token restrictions → URL restrictions**, add `https://nexuswatch.dev/*`.
   - Create it and copy the new value.
4. Go to <https://vercel.com/ethancstuart-6446s-projects/dashboard/settings/environment-variables>.
5. Edit `MAPBOX_TOKEN`, paste the new value, save for **Production**.
6. Back on the Mapbox page, **delete** the old token.
7. Redeploy: Vercel → Deployments → the newest → **⋯ → Redeploy**.

**Check it worked.** Run this. You want `200` and `image/png`, and nothing else.

```
curl -sI "https://nexuswatch.dev/api/brief/screenshot?date=2026-09-12&size=og" | head -3
```

If you see `HTTP/2 200` and `content-type: image/png`, it is correct. If the image
stops rendering in the brief, the URL restriction is too tight — remove the URL
restriction and keep the scoped token.

---

## 2. Fix the beehiiv publication id — 5 minutes

**Why.** The value in production is malformed: 37 characters starting `45fa`, where
beehiiv expects `pub_<uuid>`. Publishing has failed every day since 2026-07-09 and
the error was recorded and never surfaced.

**Merge PR #46 first** — <https://github.com/ethancstuart/nexus-watch/pull/46>. Until
it merges, this value has to be set under two different names. After it merges, one.

1. Go to <https://app.beehiiv.com/settings/integrations/api>.
2. Copy the **Publication ID**. It looks like `pub_1a2b3c4d-….`
3. Go to <https://vercel.com/ethancstuart-6446s-projects/dashboard/settings/environment-variables>.
4. Set `BEEHIIV_PUBLICATION_ID` to that value, for **Production**.
5. If a variable named `BEEHIIV_PUB_ID` exists, delete it.
6. Redeploy.

**Check it worked.** Tomorrow after 10:05 UTC:

```
curl -s https://nexuswatch.dev/api/status | head -c 200
```

Or just tell me and I will read the delivery log and confirm the beehiiv row says
`success` rather than `failed`.

---

## 3. Find out your database recovery point — 10 minutes

**Why.** Nothing in the repository records it. Nobody in this audit, including me,
can tell you how much of the public register survives an accidental delete or a
Neon incident. The daily GitHub snapshot covers the claims, not the evidence that
settles them — so `ooni_measurements`, `fx_rates` and the frozen criterion columns
are not backed up anywhere.

1. Go to <https://console.neon.tech/> and open the NexusWatch project.
2. Click **Settings → Storage** (or **Branches → main**).
3. Write down the **History retention** value. It is probably 1 day on the free
   plan, 7 on Launch.
4. Click **Backups** or **Snapshots** and note whether any schedule exists.

**Then tell me the retention number.** I will write a `pg_dump` script and a restore
runbook against it, and wire a weekly off-site dump if you want one. The database is
1.7 GB, so a compressed dump is small.

---

## 4. Decide: the 63 published calls that are wrong

**The situation.** Two unrelated defects each published misses that were actually
hits. Both are fixed going forward. Neither rewrote history, because this project's
rule is that a resolved call is never rewritten.

| cause | calls affected | status |
|---|---|---|
| Evidence table held one hour per day, not the whole day | 54 | collector fixed 2026-09-12 |
| Resolver scored the final day before its evidence existed | 9 | resolver fixed 2026-09-12 |

The public ledger currently shows 74 censorship hits and 188 misses. If all 63 are
corrected, roughly 137 hits and 125 misses.

**You have three options. Pick one.**

- **A — Correct the evidence, annotate the calls, leave the verdicts.** Run the
  backfill so the evidence table is true, publish a dated correction notice listing
  the 63 calls, and leave each call's published verdict as it was with a link to the
  notice. Most conservative. The record stays append-only and the error is on the
  record.
- **B — Correct the evidence and re-resolve the 63.** Change the verdicts, publish
  the correction notice, and state plainly that 63 calls were re-scored and why.
  Most accurate final state. Breaks the never-rewrite rule once, deliberately and
  visibly.
- **C — Evidence only, no public notice.** Not recommended. For a project whose
  entire asset is a checkable record, a silent correction is the one move that
  cannot be defended if someone notices later.

**Tell me A, B or C.** I will run the backfill, write the correction notice for your
sign-off, and do nothing public until you approve the words.

*(For reference, the backfill is `npx tsx scripts/backfill-ooni-daily.ts --write`,
it corrects about 4,810 rows, and it refuses to write anything unless every country
answers. It has never been run.)*

---

## 5. Decide: four endpoints left over from the deleted product

All four are live right now.

| endpoint | what it does today |
|---|---|
| `/api/alerts/compile` | Unauthenticated. Sends whatever text you POST to Claude and bills your Anthropic key. |
| `/api/alerts/subscribe` | Unauthenticated. Sends branded email from `alerts@nexuswatch.dev` to any address, with unescaped attacker-supplied HTML in the body. |
| `/api/fires` | NASA fire-data proxy. No caller anywhere. |
| `/api/news` | RSS proxy. No caller anywhere. The dangerous half is already removed. |

**Recommendation: delete all four.** Nothing in the site calls any of them, and two
are live abuse surfaces.

**Tell me "delete the four endpoints"** and I will open the PR.

---

## 6. Decide: the public pages describe a product that no longer exists

This one is yours because the repo rule is that published words wait for your
sign-off. I have not changed a syllable.

**What is wrong.** Eleven of the thirteen data sources named on the public pages
have no collector in the codebase. Only OONI and USGS are real. `/methodology` — the
page whose entire job is to let a stranger check your work — lists NASA FIRMS at
"10min", GDELT at "15min", OpenSky at "30s", Polymarket at "5min", Cloudflare Radar
at "5min" and four others, with refresh cadences, as though they were live. Every
archived brief carries a byline reading "Data from 12+ verified sources (ACLED,
USGS, GDELT, WHO, NASA, AIS, OONI, Polymarket). Every claim is traced to its
source." Six of those eight do not exist.

The homepage still sells a 45-layer live map, a Country Instability Index and dark
vessel detection. The privacy policy describes accounts, OAuth login, session
cookies, portfolios and a watchlist, none of which exist. `/api/v1/docs` advertises
seven endpoints and five return 404.

**Tell me "draft the copy corrections"** and I will prepare a single PR with every
false claim removed and the real six sources named, for you to read line by line
before it merges.

---

## 7. Decide: PR #38, the database cleanup — still held

<https://github.com/ethancstuart/nexus-watch/pull/38> drops 38 unused tables and
deletes 1.39 million rows of history. It has been ready since 2026-09-08 and I have
never run it, because it is destructive and irreversible.

Do step 3 first. Once you know the recovery point, this is safe to merge or safe to
say no to.

**Tell me "merge 38" or "close 38".**

---

## 8. Optional: turn on Vercel Web Analytics

Not a defect, just a gap. I tried to measure whether anyone reads the site and the
analytics API returned "Web Analytics not found", so it is not enabled. You have
been publishing a daily brief with no idea whether anyone arrives.

Vercel → the dashboard project → **Analytics** → **Enable**.

---

## What I already did, so you do not redo it

Merged and verified in production on 2026-09-12 (PR #45, commit `e64941c`):

- Closed an anonymous path-traversal that could run arbitrary commands against the
  key-value store, forge an admin session, and wipe the rate limiter's state.
- Closed `/api/cron/compute-cii`, which answered HTTP 200 to anyone and wrote to
  three production tables.
- Removed an open HTTP proxy in `/api/news`.
- Stopped the resolver publishing misses on evidence it had never seen.
- Stopped `/ledger` printing unscored calls as MISS, and made the share card's
  denominator match the page.
- Stopped a public POST from undoing anyone's unsubscribe, and a mail scanner from
  unsubscribing a reader by fetching a link.
- Stopped one fake timezone from silencing the brief for every subscriber.
- Stopped the Mapbox token being published (step 1 rotates the leaked one).
