# Runbook — GDPR & data-subject procedures

NexusWatch is publicly accessible from the EU. Even with no targeted
ads, no tracking SDKs, and a free-product model, GDPR applies the
moment a single EU resident interacts with the site or signs up for
the brief.

## Cookie banner — needed?

**Short answer: probably no, but document why.**

GDPR requires consent for "non-essential" cookies and similar
tracking. NexusWatch:

- Sets **no third-party tracking cookies** (no GA, no Hotjar, no
  Segment)
- Sets a **session cookie only when the user signs in via Google /
  GitHub OAuth** — that's a "strictly necessary" cookie, exempt from
  consent under GDPR Article 5(3) ePrivacy
- Uses **localStorage** for user preferences (theme, watchlist, layer
  state) — first-party, opted-in by usage, exempt from consent

**Conclusion:** no banner required. Document this on the privacy
page so a regulator's inquiry has a clean answer.

## Data subject access requests (DSAR)

If a user emails `hello@nexuswatch.dev` saying "what data do you have
on me?", the procedure is:

1. **Verify identity.** Reply asking them to confirm from the email
   they signed up with. Don't release data to whoever asks.
2. **Pull what we have:**
   - **Auth record** in Postgres `users` table (email, OAuth sub,
     created_at)
   - **Subscriptions** in `email_subscriptions`
   - **Watchlist + alerts** in `alert_subscriptions`
   - **Brief opens** if tracked in beehiiv (export from beehiiv
     dashboard)
   - **Audit log** of any actions they took (admin trail, if applicable)
3. **Export as JSON** — send via secure means (encrypted email, or a
   one-time share link with TTL).
4. **30-day deadline** under GDPR. Easy to hit if you have the
   procedure rehearsed.

## Right to be forgotten (RTBF)

User asks to be deleted:

1. Verify identity (same as DSAR)
2. **Soft-delete pattern:**
   ```sql
   UPDATE users SET email = NULL, oauth_sub = NULL, deleted_at = NOW() WHERE id = $1;
   DELETE FROM email_subscriptions WHERE user_id = $1;
   DELETE FROM alert_subscriptions WHERE user_id = $1;
   ```
3. **Cascade to providers:**
   - beehiiv: remove the email from their subscriber list
   - Resend: no per-user data; fine
   - Sentry: scrubbed automatically (we don't send PII; verify in
     `services/sentry.ts beforeSend()`)
4. **Confirm to the user** within 30 days.

## Data retention defaults

| Data | Retention | Justification |
|------|-----------|---------------|
| Auth record | Until deletion request | Required to operate |
| Watchlist | Until deletion request | User-controlled |
| Brief subscription | Until unsubscribe | User-controlled |
| Server logs (Vercel) | 30 days | Vercel default |
| Sentry events | 90 days | Sentry default |
| Rate-limit counters (KV) | 1 hour | TTL on the key |
| KV cache | TTL (1-6h) | Keys expire automatically |

If any user ever asks "how long do you keep my data?", point them to
this table.

## Data localisation

- **Postgres (Neon):** US-East-1 region. EU users' data crosses
  Atlantic. Document this on the privacy page.
- **KV (Upstash):** Currently US region. Same.
- **Sentry:** US-hosted by default. We don't send PII so the risk is
  low, but a privacy-strict user could object.
- **Vercel logs:** Multi-region. No way to opt-out of US processing.

If a user demands EU-only processing, the answer is: we can't
currently provide that. They can choose not to use the platform.

## DPA (Data Processing Agreement)

You're a data processor for EU users' personal data. Best-practice
is to sign DPAs with your sub-processors:

- **beehiiv** — they have a standard DPA on request
- **Resend** — they have a standard DPA
- **Sentry** — they have a standard DPA at sentry.io/legal/dpa/
- **Neon** — neon.tech/legal/dpa
- **Upstash** — upstash.com/dpa
- **Vercel** — vercel.com/legal/dpa

Download all six, file them in a `dpa/` folder somewhere not on
GitHub.

## When in doubt

GDPR enforcement is rare for small free services. Your real risk is
not fines — it's **damaging your reputation** if you mishandle a
specific request. Prioritize:

1. Respond to every email within 7 days
2. Be transparent about what you do and don't have
3. Honor deletion requests promptly
4. Never sell or share user data

If a serious legal question arises, get an actual privacy lawyer.
This runbook is operational hygiene, not legal advice.
