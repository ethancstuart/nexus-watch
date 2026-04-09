# Sports Intelligence Product — Build Prompt

> Give this to the agent working on the sports-ml-pipeline repo.

---

## Context

You're building a web application for a sports betting intelligence platform. This is a SEPARATE product from NexusWatch (our geopolitical intelligence platform), with its own brand, domain, and audience. The ML pipeline already exists at `~/sports-ml-pipeline/` with 20+ models across 4 sports, 72% MLB accuracy, 248% return from $200 start, and daily crons running predictions.

The web app needs to be built from scratch as a standalone product.

## Product Vision

"An intelligence operation that happens to cover sports." Not a picks site. Not a tout service. An ML-powered command center for serious sports bettors who want transparent, data-driven edge identification.

**Key differentiators vs Action Network, Unabated, BettingPros:**
1. Proprietary ML models with publicly verified, transparent performance tracking
2. Beautiful, Bloomberg-terminal-aesthetic visualization (not spreadsheets)
3. Edge quantification — not "bet this," but "4.2% expected value at -145, driven by pitcher matchup advantage"
4. Multi-sport unified intelligence (MLB, NBA, NFL, NHL from one platform)
5. Full model reasoning — show WHY, not just WHAT

## Tech Stack

- **Framework:** Next.js 16 App Router (deployed on Vercel)
- **Database:** Neon Postgres (via Vercel Marketplace) for picks, performance tracking, user accounts
- **Auth:** Clerk or Supabase Auth (Google/GitHub/email)
- **Payments:** Stripe ($29/mo Starter, $49/mo Pro)
- **Styling:** Tailwind CSS v4 with dark theme (Bloomberg terminal aesthetic — dark background, monospace font, orange/green/red accents)
- **Data source:** The existing sports-ml-pipeline outputs. The pipeline writes predictions to files/database daily. The web app reads from those outputs.

## Pages to Build

### 1. Landing Page (`/`)
- Hero: "Sports intelligence. Not picks." 
- Show the track record prominently: "248% return. 72% MLB accuracy. Fully transparent."
- Email signup for daily picks email
- Pricing (Starter $29/mo, Pro $49/mo)
- Feature comparison grid

### 2. Today's Slate (`/today`)
- Card grid showing every game today across all active sports
- Each card shows:
  - Teams, time, venue
  - Model pick (which side) with confidence % (0-100)
  - Current market line vs model's fair line
  - Edge value (% expected value if positive)
  - Color coding: green (strong edge >3%), yellow (moderate 1-3%), gray (no edge)
- Click to expand any card for deep analysis
- Filter by sport, by confidence threshold, by edge size

### 3. Game Deep Dive (`/game/[id]`)
- Full model analysis for one game:
  - Pitcher/QB/goalie matchup analysis
  - Injury impact scores (from Swish Analytics when available)
  - Weather factors (wind direction, temperature)
  - Historical model accuracy in similar situations
  - "In N similar matchups, the model was X% accurate"
  - Line movement chart (opening → current, with model fair line overlay)
  - Bet sizing recommendation (Kelly Criterion based on edge and user's bankroll)

### 4. Model Performance (`/performance`)
- THIS IS THE MOST IMPORTANT PAGE — it's what builds trust
- Cumulative P&L chart (the $200 → $696 journey, updated daily)
- Accuracy by sport (MLB, NBA, NFL, NHL)
- Accuracy by bet type (moneyline, spread, total, NRFI, etc.)
- Rolling 30/60/90 day accuracy
- Monthly breakdown table
- Every historical pick listed with result (fully auditable)
- No cherry-picking — show losses too. Transparency IS the brand.

### 5. Daily Email Brief (`/brief`)
- Archive of daily picks emails
- Email signup
- Format: clean, monospace, dark theme HTML email
  - "TODAY'S EDGE" — top 3 picks by edge value
  - Confidence levels for each
  - One-sentence model reasoning
  - Link to full analysis on the site
  - Previous day's results + running P&L

### 6. Alerts (`/alerts`) — Pro only
- "Alert me when the model finds 4%+ edge on any MLB game"
- "Alert me when a line moves 3+ points toward the model's pick"
- Push notifications via email or browser

### 7. Bankroll Tracker (`/bankroll`) — Pro only  
- User inputs starting bankroll
- Platform tracks all bets placed, won, lost
- Kelly Criterion bet sizing per pick
- Drawdown chart
- Risk-adjusted return metrics

## Pricing

| Tier | Price | Features |
|------|-------|---------|
| **Free** | $0 | Today's picks (confidence only, no reasoning), performance dashboard (30-day), daily email (3x/week) |
| **Starter** | $29/mo | Full picks with reasoning + edge value, full performance history, daily email, 3 alerts |
| **Pro** | $49/mo | Everything + bankroll tracker, Kelly sizing, unlimited alerts, API access, historical pattern matching |

## Data Integration

The sports-ml-pipeline writes daily predictions. The web app needs to:
1. Read the pipeline's output (CSV/JSON/Postgres — check what format the pipeline uses)
2. Store picks + results in its own Postgres tables for the performance tracker
3. Run a daily cron that:
   - Fetches today's predictions from the pipeline
   - Checks yesterday's results (did picks win/lose?)
   - Updates the performance database
   - Sends the daily email to subscribers

## Design Requirements

- **Dark theme only** (matches the "intelligence" brand)
- **Monospace font** (JetBrains Mono or similar)
- **Color palette:** Black background (#000/#0a0a0a), orange accent (#ff6600), green for wins (#22c55e), red for losses (#ef4444)
- **Mobile-first** — bettors check picks on their phone
- **Fast** — the slate page should load in <1 second
- **No gambling ads, no affiliate links, no tout-service aesthetics** — this is an intelligence product

## Brand

Needs its own name and domain. Suggestions (check availability):
- EdgeWatch
- SignalBets  
- SharpEdge
- PredictiveEdge
- The model can suggest names too

The brand should feel technical, analytical, premium — not flashy or gambling-adjacent. Think "Bloomberg for sports" not "DraftKings for analytics."

## What NOT to Build

- No social features (no following, no comments, no "community picks")
- No manual/human picks — everything is model-driven
- No "guaranteed" language — always show confidence levels, never promise outcomes
- No gamification (no streaks, badges, leaderboards) — this is a tool, not a game
- No integration with NexusWatch — completely separate product, separate domain, separate billing

## Priority Order

1. Landing page + email signup (Day 1)
2. Today's slate + game deep dive (Day 2-3)
3. Model performance page (Day 3-4) 
4. Daily email brief (Day 4-5)
5. Auth + Stripe + tier gating (Day 5-6)
6. Alerts + bankroll tracker (Week 2)
