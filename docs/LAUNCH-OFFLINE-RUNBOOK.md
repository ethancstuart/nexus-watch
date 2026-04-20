# NexusWatch — Launch Offline Runbook
**Updated:** 2026-04-20
**Do these in order. Each section ends with "Give back to Claude" — paste those values when you return.**

---

## Priority Guide

| Priority | Item | Time | Deadline |
|---|---|---|---|
| 🔴 BLOCKING | Typefully account + API key | 20 min | Before April 28 |
| 🔴 BLOCKING | Stripe key rotation | 3 min | Before April 27 |
| 🟡 PRE-LAUNCH | Beehiiv custom domain DNS | 10 min | Before April 28 |
| 🟡 PRE-LAUNCH | LinkedIn Company Page | 10 min | Before LinkedIn automation goes live |
| 🟢 POST-LAUNCH | Substack publication | 5 min | When ready |
| 🟢 POST-LAUNCH | Medium integration token | 3 min | When ready |
| 🟢 POST-LAUNCH | Bluesky account + app password | 5 min | When ready |
| 🟢 POST-LAUNCH | Threads account | 3 min | When ready |

---

## 1. Typefully — X + LinkedIn posting relay 🔴 BLOCKING

**What it is:** Typefully is the service that takes posts from NexusWatch and actually publishes them to X (Twitter) and LinkedIn. Without this, automation posts nowhere.

**Cost:** $29/month (Creator plan — required for API access and scheduling)

---

### Step 1 — Create account

1. Open **https://typefully.com** in your browser
2. Click the **"Get started for free"** button (top right)
3. Click **"Continue with Google"**
4. Sign in with **ethan.c.stuart@gmail.com**
5. When prompted for your name: enter **"NexusWatch"**
6. When asked what you want to use Typefully for: select **"Scheduling & Automation"**
7. You will land on the Typefully dashboard

---

### Step 2 — Upgrade to Creator plan

1. Click your **profile picture or initials** in the bottom-left corner of the dashboard
2. Click **"Upgrade"** or **"Plans"**
3. Find the plan called **"Creator"** (it should be $29/month or similar — it's the tier that includes API access)
4. Click **"Upgrade to Creator"**
5. Enter your billing details and confirm payment
6. You should see a confirmation screen. Click **"Back to dashboard"**

---

### Step 3 — Connect X (Twitter)

1. On the left sidebar, look for **"Connections"** or a plug/link icon — click it
2. You will see a list of platforms. Find **"X (Twitter)"**
3. Click **"Connect X"** or the **"+"** button next to X
4. A new browser window or popup will open taking you to X/Twitter
5. Log in to X with the **@NexusWatch** account credentials (or whichever X account you're using)
6. Click **"Authorize app"**
7. The popup closes. You should see X listed as **"Connected"** with a green indicator

---

### Step 4 — Connect LinkedIn

> **Note:** You need the LinkedIn Company Page created first (Section 4 of this doc). If you haven't done that yet, skip to Section 4, complete it, then come back here.

1. Still in Typefully **"Connections"**
2. Find **"LinkedIn"** in the list
3. Click **"Connect LinkedIn"**
4. A new window opens — sign in to LinkedIn with your personal account (the one that manages the NexusWatch Company Page)
5. LinkedIn will ask which account to connect. You should see both your **personal profile** and the **NexusWatch Company Page**
6. Select **"NexusWatch"** (the company page, not your personal profile)
7. Click **"Allow"**
8. The popup closes. You should see LinkedIn listed as **"Connected — NexusWatch"**

---

### Step 5 — Get your API key

1. In the bottom-left corner, click your **profile picture or initials**
2. Click **"Settings"**
3. In the Settings page, look for a section called **"API"** or **"Developer"** or **"Integrations"**
4. Click **"Generate API Key"** or **"Create new key"**
5. A long string appears — it looks like: `tfa_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
6. Click **"Copy"** next to the key

---

### Give back to Claude:
```
TYPEFULLY_API_KEY = [paste the key here]
X connected: yes/no
LinkedIn connected: yes/no (which account name shows)
```

---

## 2. Stripe secret key rotation 🔴 BLOCKING

**Why:** The live Stripe key added today auto-rotates every 7 days. It will expire around April 27 — the day before launch. Do this on April 26 or 27.

---

### Steps

1. Open **https://dashboard.stripe.com** in your browser
2. Make sure you are in **Live mode** — check the toggle at the top of the left sidebar. It should say **"Live"** not **"Test"**. If it says Test, click it to switch.
3. In the left sidebar, click **"Developers"**
4. Click **"API keys"**
5. Under **"Standard keys"**, find the row labeled **"Secret key"** — the value shows as `sk_live_••••••••`
6. Click the **"..."** menu on the right side of that row
7. Click **"Roll key"**
8. A confirmation dialog appears — click **"Roll API key"**
9. The new key appears **once only** — it starts with `sk_live_`
10. Click **"Copy"** immediately. If you close this screen without copying, you will need to roll it again.

---

### Give back to Claude:
```
New STRIPE_SECRET_KEY = sk_live_[paste full key here]
```

---

## 3. Beehiiv custom domain (brief.nexuswatch.dev) 🟡 PRE-LAUNCH

**Why:** Right now your newsletter delivers from a beehiiv subdomain. This wires it to send from `brief.nexuswatch.dev` — looks professional and deliverability is better.

---

### Part A — Add DNS record in Vercel (5 min)

1. Open **https://vercel.com** and sign in
2. In the top navigation, click your **team name** (should say "ethancstuart-6446s-projects" or similar)
3. Click **"Domains"** in the left sidebar
4. Find **nexuswatch.dev** in the list and click on it
5. You are now on the domain management page
6. Click **"Add"** or **"Add Record"** button
7. A form appears. Fill it in exactly as follows:
   - **Type:** select `CNAME` from the dropdown
   - **Name:** type `brief` (just the word brief, nothing else)
   - **Value:** type `customdomain.beehiiv.com`
   - **TTL:** leave as default (usually `Auto` or `3600`)
8. Click **"Add"** or **"Save"**
9. You should see the new record appear in the list: `brief.nexuswatch.dev → customdomain.beehiiv.com`

---

### Part B — Configure in beehiiv (5 min)

1. Open **https://app.beehiiv.com** and sign in
2. In the left sidebar, click **"Settings"** (gear icon)
3. Click **"Publication"** or **"General"** in the Settings submenu
4. Scroll down until you find a section called **"Custom Domain"** or **"Domain"**
5. Click **"Add custom domain"** or **"Edit"** if one is already there
6. In the field, type: `brief.nexuswatch.dev`
7. Click **"Save"** or **"Verify"**
8. beehiiv will attempt to verify the DNS record. This can take 2–10 minutes.
9. Wait on this page or refresh after 5 minutes
10. When verified, you will see a **green checkmark** or **"Active"** status next to the domain

---

### Give back to Claude:
```
Beehiiv custom domain status: Active/Pending/Failed
brief.nexuswatch.dev shows in beehiiv: yes/no
```

---

## 4. LinkedIn Company Page 🟡 PRE-LAUNCH

**Why:** Typefully needs a LinkedIn Company Page to connect to (not your personal profile). This is what posts appear as coming from.

---

### Steps

1. Open **https://www.linkedin.com** and sign in with your personal account
2. In the top navigation bar, click **"For Business"** (usually in the top right, may appear as a grid icon or "Work")
3. In the dropdown menu that appears, click **"Create a Company Page"**
4. You are asked what type of page. Click **"Small business"**
5. Fill in the form exactly as follows:

   **Page identity section:**
   - **Company name:** `NexusWatch`
   - **LinkedIn public URL:** `nexuswatch` (LinkedIn auto-fills this as `linkedin.com/company/nexuswatch` — if "nexuswatch" is taken, try `nexuswatch-intel`)
   - **Website:** `https://nexuswatch.dev`

   **Company details section:**
   - **Industry:** Click the dropdown → type `Information Services` → select it
   - **Company size:** Select `1-10 employees`
   - **Company type:** Select `Privately Held`

   **Profile details section:**
   - **Tagline:** `Real-time geopolitical intelligence. 158 countries, 45 live data layers.`
   - **Logo:** Click **"Upload logo"** → navigate to `/Users/ethanstuart/Projects/nexus-watch/public/favicon.svg` or any NexusWatch logo file you have. Minimum size is 300x300px — if the SVG doesn't work, use a PNG export.

6. Check the verification checkbox: **"I verify that I am an authorized representative of this organization"**
7. Click **"Create page"**
8. You land on your new company page
9. Copy the URL from your browser — it will look like: `https://www.linkedin.com/company/nexuswatch/` or `https://www.linkedin.com/company/12345678/`

---

### Give back to Claude:
```
LinkedIn Company Page URL = https://www.linkedin.com/company/[paste here]
Public URL slug = nexuswatch (or whatever it gave you)
```

---

## 5. Substack publication 🟢 POST-LAUNCH

**Do this when you're ready to activate Substack — not required for April 28.**

---

### Steps

1. Open **https://substack.com** and click **"Start writing"** or **"Sign up"**
2. Sign up using: **ethan.c.stuart@gmail.com** (or create a separate brand email first)
3. When asked for your publication name: `The NexusWatch Brief`
4. When asked for your Substack URL: type `thenexuswatchbrief` → your URL becomes `thenexuswatchbrief.substack.com`
5. When asked for category: click **"Politics"** → then **"Foreign Policy"** (or closest equivalent)
6. Complete setup and land on your Substack dashboard
7. Click the **gear icon** (Settings) in the top right
8. Click **"Publishing"** in the left settings menu
9. Scroll down to find **"Email-to-post"** or **"Send by email"** section
10. You will see an inbound email address — it looks like: `[random-string]@substack.com`
11. Copy that full email address

---

### Give back to Claude:
```
Substack inbound email address = [paste here]
Substack publication URL = thenexuswatchbrief.substack.com (confirm or correct)
```

---

## 6. Medium integration token 🟢 POST-LAUNCH

**Do this when you're ready to activate Medium cross-posting.**

---

### Steps

1. Open **https://medium.com** and sign in (use ethan.c.stuart@gmail.com or create a new account)
2. Click your **profile picture** in the top right
3. Click **"Settings"**
4. In the left sidebar of Settings, scroll down to find **"Security and apps"** or **"Integration tokens"**
5. Under **Integration tokens**, click **"Get integration token"**
6. Enter a description: `NexusWatch automation`
7. Click **"Get token"** or **"Submit"**
8. A token appears — it is a long string
9. Copy the full token immediately (it is only shown once)

---

### Give back to Claude:
```
MEDIUM_INTEGRATION_TOKEN = [paste here]
Medium profile URL = https://medium.com/@[your username]
```

---

## 7. Bluesky account + app password 🟢 POST-LAUNCH

---

### Steps

1. Open **https://bsky.app** in your browser
2. Click **"Sign up"**
3. Fill in:
   - **Email:** ethan.c.stuart@gmail.com (or brand email)
   - **Handle:** `nexuswatch` → your handle becomes `@nexuswatch.bsky.social`
   - **Password:** create a strong password
4. Complete email verification if prompted
5. You are now logged in as `@nexuswatch.bsky.social`
6. In the left sidebar, click **"Settings"** (gear icon)
7. Click **"Privacy and security"** or look for **"App Passwords"** directly
8. Click **"App Passwords"**
9. Click **"Add App Password"**
10. Enter a name: `NexusWatch Automation`
11. Click **"Create App Password"**
12. A password appears in the format: `xxxx-xxxx-xxxx-xxxx`
13. Copy it immediately — it is shown only once

---

### Give back to Claude:
```
BLUESKY_HANDLE = nexuswatch.bsky.social
BLUESKY_APP_PASSWORD = [paste here]
```

---

## 8. Threads account 🟢 POST-LAUNCH

**Threads requires an Instagram account first.**

---

### Steps

1. Open **https://www.instagram.com** in your browser
2. Click **"Sign up"** 
3. Fill in:
   - **Mobile number or email:** ethan.c.stuart@gmail.com
   - **Full name:** `NexusWatch`
   - **Username:** `nexuswatch` (if taken, try `nexuswatch_intel` or `nexuswatchdev`)
   - **Password:** create a strong password
4. Complete verification and arrive at your Instagram profile
5. Now open **https://www.threads.net** in your browser
6. Click **"Log in with Instagram"**
7. Sign in with the Instagram account you just created
8. Your Threads handle will be `@nexuswatch` (matching Instagram)
9. Complete the Threads profile setup — copy the profile URL from your browser

No API key needed for Threads initially — Typefully handles the posting relay once connected.

---

### Give back to Claude:
```
Instagram username = @nexuswatch (or whatever you got)
Threads handle = @nexuswatch (confirm or correct)
Threads profile URL = https://www.threads.net/@[handle]
```

---

## What Claude needs back — summary sheet

When you've done any of the above, paste this block back with your values filled in:

```
--- NexusWatch Manual Steps Results ---

[Section 1 — Typefully]
TYPEFULLY_API_KEY =
X connected (yes/no) =
LinkedIn connected, account name showing =

[Section 2 — Stripe rotation] (do April 26-27)
New STRIPE_SECRET_KEY =

[Section 3 — Beehiiv DNS]
brief.nexuswatch.dev status (Active/Pending/Failed) =

[Section 4 — LinkedIn Company Page]
LinkedIn Company Page URL =
LinkedIn public URL slug =

[Section 5 — Substack] (post-launch)
Substack inbound email =

[Section 6 — Medium] (post-launch)
MEDIUM_INTEGRATION_TOKEN =

[Section 7 — Bluesky] (post-launch)
BLUESKY_HANDLE =
BLUESKY_APP_PASSWORD =

[Section 8 — Threads] (post-launch)
Instagram username =
Threads handle =
```

---

## After you give Claude the results

For each section completed, Claude will:
- Push new env vars to Vercel automatically
- Update any config that needs the new values
- Confirm what's now live vs still pending
- Tell you the exact order to flip automation switches

**The two things that unblock April 28 are Section 1 (Typefully) and Section 3 (Beehiiv DNS). Do those first.**
