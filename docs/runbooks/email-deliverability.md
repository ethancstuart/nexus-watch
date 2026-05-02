# Runbook — Email deliverability (DMARC / SPF / DKIM)

NexusWatch sends three classes of email:

1. **Daily brief** via beehiiv → `brief.nexuswatch.dev` mail-from
2. **Transactional** via Resend → `hello@nexuswatch.dev` and
   `noreply@nexuswatch.dev`
3. **Alerts** (when wired) via Resend → user's address

If any of these land in spam, the platform's content engine fails
silently. Verify quarterly.

## What needs to be true

For each sending domain:

- **SPF record** — TXT at the apex listing all senders Vercel /
  beehiiv / Resend allow. Avoid > 10 DNS lookups (SPF will fail).
- **DKIM key** — provider-published; you add a CNAME or TXT to your
  DNS pointing at the provider's selector.
- **DMARC policy** — TXT at `_dmarc.<domain>` saying
  `v=DMARC1; p=quarantine; rua=mailto:dmarc@nexuswatch.dev` (start
  with `p=none` if you're shaking out config; tighten to `quarantine`
  then `reject` once aligned).

## Verification checklist

```bash
# SPF (apex)
dig +short TXT nexuswatch.dev | grep "v=spf1"

# DKIM (selector varies by provider; check provider dashboard)
dig +short TXT resend._domainkey.nexuswatch.dev
dig +short TXT bh1._domainkey.nexuswatch.dev   # beehiiv

# DMARC
dig +short TXT _dmarc.nexuswatch.dev
```

Expected:
- SPF includes `include:_spf.resend.com` and `include:beehiiv.com` (or
  whatever those providers' SPF anchors are — check their dashboards).
- DKIM returns a valid selector record per provider.
- DMARC has at least `v=DMARC1; p=none; rua=...`.

## Test deliverability

Send a test email to **mail-tester.com** — they give you a temporary
address. Score should be 9.5/10 or better. Lower scores tell you
exactly what's missing.

Alternative: **postmark spamcheck**
(https://www.mail-tester.com/spamassassin)

## Common gotchas

- **SPF too long** — every additional `include:` adds one DNS lookup.
  Cap at 10 total (the standard's hard limit). Use SPF flatteners if
  you're close.
- **DKIM expired** — providers rotate keys. Set a calendar reminder
  to verify quarterly.
- **DMARC `rua` mailbox** — Google/Microsoft will send daily
  aggregate reports. Either parse them with a tool (dmarcian.com) or
  monitor by hand.
- **Subdomain alignment** — `brief.nexuswatch.dev` needs its own SPF
  / DKIM if you send from there directly. Don't assume the apex
  config covers subdomains.

## When something goes wrong

Symptom: "people aren't getting the brief"

1. Check beehiiv dashboard — Sent Items tab. Did it actually send?
2. Send to your own gmail + outlook + apple mail. Check inbox vs spam
   on each.
3. Run mail-tester.com against the latest brief. Score < 9 = there's
   a config issue. They'll tell you which.
4. Check `_dmarc` aggregate reports for which receivers are failing
   alignment.

## Set up monitoring

Recommend signing up for **dmarcian.com** (free tier covers most
single-domain senders). They parse aggregate reports automatically
and email you when failure rates spike.

## When to revisit

- Before launch
- Quarterly
- After any provider change (switching from Resend to Postmark, etc.)
- After any DNS change at the registrar
