# Runbook — Domain hygiene

`nexuswatch.dev` is the public face. If the domain expires, gets
hijacked, or breaks DNS, the entire platform vanishes. Verify
quarterly.

## Checks (run all of these)

### 1. Registrar + expiry

```bash
whois nexuswatch.dev | grep -iE "Registrar|Expiry|Expir"
```

- Confirm registrar is who you think (likely Vercel / Google Domains
  / Cloudflare).
- Expiry date should be > 6 months out.
- If under 1 year: enable autopay or extend now.

### 2. Apex resolution

```bash
dig +short nexuswatch.dev
dig +short AAAA nexuswatch.dev
```

Should return Vercel-issued IPs (and IPv6 AAAA if Vercel has it
configured, which they do by default).

### 3. www subdomain redirect

```bash
curl -sI https://www.nexuswatch.dev | head -3
```

Should return either `301 Moved Permanently` or `308 Permanent
Redirect` to `https://nexuswatch.dev`. If it returns 404 or its own
content, the redirect isn't configured — add it in Vercel → Project
→ Domains → www.nexuswatch.dev → Redirect to apex.

### 4. DNSSEC

```bash
dig +short DS nexuswatch.dev
```

Empty result = DNSSEC not enabled. Recommended for credibility.
Enable in your registrar's DNS settings.

### 5. HSTS preload eligibility

NexusWatch already sends `Strict-Transport-Security: max-age=31536000;
includeSubDomains`. To be eligible for the browser preload list, also
add `; preload` and submit at https://hstspreload.org/. **Caveat:**
once preloaded, you can never serve `nexuswatch.dev` over plain HTTP.
Read the warnings carefully.

### 6. SSL certificate

```bash
echo | openssl s_client -showcerts -connect nexuswatch.dev:443 -servername nexuswatch.dev 2>/dev/null | openssl x509 -noout -dates -issuer
```

Should show:
- Issuer: Let's Encrypt or Vercel-managed
- `notAfter`: > 30 days out (Vercel auto-renews ~30 days before)

### 7. CAA record (optional but recommended)

```bash
dig +short CAA nexuswatch.dev
```

Empty = anyone can issue an SSL cert for your domain. Recommend
adding:

```
nexuswatch.dev. CAA 0 issue "letsencrypt.org"
nexuswatch.dev. CAA 0 issue "vercel.com"
```

### 8. Subdomain inventory

```bash
# Try the obvious ones
for sub in www brief api admin status app; do
  echo -n "$sub.nexuswatch.dev: "
  dig +short ${sub}.nexuswatch.dev
done
```

Active subdomains:
- `nexuswatch.dev` — apex (Vercel)
- `brief.nexuswatch.dev` — beehiiv-published newsletter
- `www.nexuswatch.dev` — should redirect to apex

If any of those don't resolve correctly, fix in registrar DNS.

## Set up monitoring

- **uptimerobot.com** — free, pings every 5 min, alerts on outage
- **expirymonitor.com** or set a calendar reminder for 3 months
  before domain expiry
- Vercel sends an email when SSL cert renewal fails (rare but
  happens)

## Emergency: domain transfer

If you ever need to move registrars:

1. Unlock the domain at current registrar
2. Get the EPP / auth code
3. Initiate transfer at new registrar with the code
4. Approve at old registrar (email confirmation)
5. Wait 5-7 days for transfer to complete
6. Re-add all DNS records at new registrar BEFORE the transfer
   completes (DNS doesn't transfer with the domain at most
   registrars)

**Critical:** do NOT let the domain expire during a transfer.
Renewal is much easier than recovery.
