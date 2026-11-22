/**
 * Dated correction notes for the affected briefs, and the introduction of the
 * /corrections page. DATA, NOT CODE: one entry per edition date.
 *
 * NOTHING IN THIS FILE IS SHOWN TO A READER UNTIL THE OWNER APPROVES IT. Every
 * surface reads it through api/_lib/corrections.ts, whose gate passes on a
 * note only when TWO keys agree: its status here is 'approved' with a real
 * correctedOn, AND its edition date is listed in APPROVED_NOTE_DATES in
 * api/_lib/corrections-approvals.ts. The gate checks both on every request of
 * every deployment, so a status changed here by accident, or an approval typed
 * on the wrong entry, shows nothing anywhere. (The integrity test also fails
 * on it, but no Vercel build runs the tests.) The wording below is an
 * unapproved draft.
 *
 * TO APPROVE ONE NOTE, in one commit: on its entry here, change
 * `status: 'draft'` to `status: 'approved'` and add
 * `correctedOn: 'YYYY-MM-DD'`, the date the note goes live (readers see it as
 * "Correction added D Mon YYYY."; the type refuses an approved entry without
 * it); add the edition date to APPROVED_NOTE_DATES in corrections-approvals.ts;
 * and add it to APPROVED_DATES in corrections-data.test.ts.
 * TO WITHDRAW ONE: set its status back to 'draft', delete its correctedOn
 * line, and remove its date from both lists.
 * NEVER PUSH A BRANCH CARRYING A TRIAL APPROVAL: every pushed branch gets a
 * public Vercel preview, which runs no tests, so the note would be published
 * at that preview's URL.
 *
 * `text` is the note after its opening sentence, copied exactly from the
 * private drafts (the drafting marker "[NEW]" removed). The opening sentence,
 * "Correction added <date>. This edition contained <kind> statements.", is not
 * stored: the code renders it from correctedOn and classification
 * (api/_lib/correction-words.ts), so the date is never typed into the prose.
 *
 * Generated 2026-11-22 from the drafts by a script kept outside this
 * repository; edit by hand from here on.
 */
import type { CorrectionNote, CorrectionsPageIntro } from './correction-words.js';

export const CORRECTION_NOTES: readonly CorrectionNote[] = [
  {
    date: '2026-08-23',
    status: 'draft',
    classification: 'false',
    text: "On 23 Aug 2026 we wrote “2,136 confirmed blocking measurements over the past week — the highest sustained level we've tracked since March”. Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Russia 47,533 (we said 2,136), Iran 40,962 (we said 1,662), Turkey 1,889 (we said 112) and Myanmar 195 (we said 11). Not a record: Russia's 7-day count ranked 34th of 169 rolling 7-day periods since 1 Mar and its blocked share (4.6%) 4th. No spike in Turkey: its count fell 8% week on week (2,050 to 1,889). We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-08-24',
    status: 'draft',
    classification: 'false',
    text: "On 24 Aug 2026 we wrote “OONI recorded 2,183 confirmed blocking measurements in Russia over the last seven days and 1,808 in Iran…”. Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Russia 48,376 (we said 2,183), Iran 42,367 (we said 1,808), Turkey 1,929 (we said 117) and Myanmar 206 (we said 11). We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-08-25',
    status: 'draft',
    classification: 'false',
    text: "On 25 Aug 2026 we wrote “OONI recorded 1,821 confirmed blocking measurements in the last 7 days, the highest count in the dataset”. Until 12 Sep our collector kept one hour of each day, so our figure was far too low: OONI's 6-day total for Iran was 42,444 (we said 1,821). Iran's 7-day count was its highest since 1 Mar, but its blocked share (29.1%) ranked 17th of 171 rolling 7-day periods, and our comparison used stored data that held one hour per day. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-08-26',
    status: 'draft',
    classification: 'false',
    text: "On 26 Aug 2026 we wrote “Iran → OONI censorship measurements jumped to 1,933 in the last 7 days, the highest volume in today's data”. Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Iran 43,262 (we said 1,933) and Russia 44,939 (we said 1,994). Russia, not Iran, had the highest count, in OONI's totals and in our own figures. We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-08-27',
    status: 'draft',
    classification: 'false',
    text: "On 27 Aug 2026 we wrote “…the highest weekly total we're seeing globally and nearly triple the volume Russia recorded in the same window”. Of the 23 countries we checked, Russia (44,840), not Iran (43,768), had the highest count, so Russia was not second after Iran; Iran's count was 0.98 times Russia's, not nearly triple (1.13 times on our own figures). Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Russia 44,840 (we said 1,734), Iran 43,768 (we said 1,960) and Turkey 1,926 (we said 125). We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-08-28',
    status: 'draft',
    classification: 'false',
    text: "On 28 Aug 2026 we wrote “Turkey 43 (▼-5) — OONI recorded 133 confirmed blocks this week, down from prior week”. Turkey's count did not fall: it rose 4% week on week (1,903 to 1,984). Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Iran 43,525 (we said 1,919), Russia 42,013 (we said 1,842) and Turkey 1,984 (we said 133). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-08-29',
    status: 'draft',
    classification: 'false',
    text: "On 29 Aug 2026 we wrote “Russia and Iran hit record censorship in the same week”. Not a record: Russia's 7-day count ranked 46th of 175 rolling 7-day periods since 1 Mar and its blocked share (4.3%) 18th; Iran's count ranked 3rd and its blocked share (29.6%) 4th. No surge: Iran's count rose only 3% week on week. Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Russia 42,972 (we said 2,282) and Iran 42,064 (we said 1,863). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-08-30',
    status: 'draft',
    classification: 'false',
    text: "On 30 Aug 2026 we wrote “Iran and Russia hold record censorship in the same week”. Not a record: Iran's 7-day count ranked 6th of 176 rolling 7-day periods since 1 Mar and its blocked share (29.5%) 6th; Russia's count ranked 50th and its blocked share (4.1%) 40th. Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Iran 41,252 (we said 1,879), Russia 40,278 (we said 1,789) and China 362 (we said 4). We also wrote that OONI recorded no blocks in Thailand that week, from 11 measurements; OONI confirmed blocking in 178 of 63,236 tests. We also wrote that OONI had recorded no blocks in Bangladesh that week and had not confirmed any in Uzbekistan; OONI's totals show 1 in Bangladesh (26 Aug) and 2 in Uzbekistan (28 Aug). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-08-31',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 31 Aug 2026 we wrote “Russia and Iran hit record censorship in the same week”. Not a record: Iran's 7-day count ranked 6th of 177 rolling 7-day periods since 1 Mar and its blocked share (29.6%) 5th; Russia's count ranked 49th and its blocked share (4.1%) 44th. Russia led on count, but 4.1% of its tests were confirmed blocked, against 29.6% in Iran. No surge: Iran's count fell 2% week on week. Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Russia 42,270 (we said 2,179), Iran 41,600 (we said 1,722), Turkey 1,940 (we said 112), China 320 (we said 4) and Myanmar 97 (we said 5). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-01',
    status: 'draft',
    classification: 'false',
    text: "On 1 Sep 2026 we wrote “Russia and Iran hit record censorship in the same week”. Not a record: Iran's 7-day count ranked 10th of 178 rolling 7-day periods since 1 Mar and its blocked share (29.5%) 6th; Russia's count ranked 42nd and its blocked share (4.3%) 19th. Nor were they the highest in weeks: Iran's count was higher in the week to 30 Aug and Russia's in the week to 27 Aug. No surge: Iran's count fell 11% week on week (43,262 to 38,328), not up from 340. Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Russia 46,165 (we said 2,454), Iran 38,328 (we said 1,344) and Turkey 1,935 (we said 103). We also wrote that OONI showed only 11 measurements for Thailand that week; OONI confirmed blocking in 220 of 58,520 tests. We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-02',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 2 Sep 2026 we wrote “Russia and Iran hit record censorship in the same week”. Not a record: Iran's 7-day count ranked 12th of 179 rolling 7-day periods since 1 Mar and its blocked share (29.7%) 4th; Russia's count ranked 36th and its blocked share (4.4%) 13th. No spike in Iran: its count fell 21% week on week. Turkey's count did not fall; it was flat (1,926 to 1,930). Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Russia 46,089 (we said 2,503), Iran 34,611 (we said 1,238) and Turkey 1,930 (we said 99). We also wrote that our figures captured DNS tampering, TCP/IP blocking and TLS disruption across multiple probe types. They were OONI's confirmed count from a single test type, web connectivity; OONI's data reports anomalies and failures separately. We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-03',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 3 Sep 2026 we wrote “Russia and Iran hit record censorship in the same week”. Not a record: Iran's 7-day count ranked 15th of 180 rolling 7-day periods since 1 Mar and its blocked share (28.8%) 32nd; Russia's count ranked 37th and its blocked share (4.4%) 13th. Iran's count was not up 244%: it fell 25% week on week (43,525 to 32,668). Russia's count rose 13% week on week, but its blocked share barely changed (4.35% to 4.47%), and its daily count did not rise seven days straight: it fell on 29 Aug, 1 Sep and 2 Sep. Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Russia 47,270 (we said 2,733) and Iran 32,668 (we said 1,166), and OONI recorded 6,671 for Russia on 27 Aug (we said 18). We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-04',
    status: 'draft',
    classification: 'false',
    text: "On 4 Sep 2026 we wrote “Russia and Iran hit record censorship in the same week”. Not a record: Iran's 7-day count ranked 14th of 181 rolling 7-day periods since 1 Mar and its blocked share (28.8%) 32nd; Russia's count ranked 34th and its blocked share (4.5%) 12th. Iran's blocking neither spiked nor persisted: its count fell 20% week on week (42,064 to 33,748). Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Russia 47,800 (we said 2,241) and Iran 33,748 (we said 1,138). We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-05',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 5 Sep 2026 we wrote “Russia and Iran run record censorship in the same week”. Not a record: Iran's 7-day count ranked 14th of 182 rolling 7-day periods since 1 Mar and its blocked share (29.1%) 24th; Russia's count ranked 36th and its blocked share (4.6%) 12th. Iran's count was neither surging nor sustained: it fell 17% week on week (41,252 to 34,040). It was 1.4 times its July average, not triple, and its 7-day count was 16% above mid-August's (34,667 in the week to 15 Aug), not up from about 300. Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Russia 49,991 (we said 2,769) and Iran 34,040 (we said 1,137). We also wrote that OONI measures failed VPN handshakes, TLS resets and HTTP timeouts; the figures we cited were OONI's confirmed count from a single test type, web connectivity, and OONI's data reports anomalies and failures separately. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-06',
    status: 'draft',
    classification: 'false',
    text: "On 6 Sep 2026 we wrote “Russia and Iran log record censorship in one week”. Not a record: Russia's 7-day count ranked 33rd of 183 rolling 7-day periods since 1 Mar, though its blocked share (4.8%) was its highest since 1 Mar; Iran's count ranked 15th and its blocked share (29.1%) 24th. Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Russia 49,407 (we said 2,346) and Iran 33,184 (we said 1,019). We also wrote that OONI recorded no confirmed blocking in Bangladesh or Uzbekistan by 5 Sep, and blocking in Thailand on 3 days. OONI's totals for 24 Aug to 4 Sep show confirmed blocking in Bangladesh on 4 days, in Uzbekistan on 2 days and in Thailand on all 12. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-07',
    status: 'draft',
    classification: 'false',
    text: "On 7 Sep 2026 we wrote “OONI's India count is up from near-zero the week prior, concentrated around government-critical platforms”. India's count did not rise from near zero: it rose 2% week on week (3,369 to 3,447). Of the 23 countries we checked, India's count was the third-highest, ahead of Turkey's (1,929), not fourth behind it. No surge in Iran: its count fell 8% week on week. Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Russia 48,518 (we said 1,961), Iran 35,328 (we said 1,271) and India 3,447 (we said 68). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-08',
    status: 'draft',
    classification: 'false',
    text: "On 8 Sep 2026 we wrote “…1,283 confirmed blocking measurements in seven days — the highest week-over-week total in our…”. Until 12 Sep our collector kept one hour of each day, so our figures were far too low: OONI's 6-day totals were Iran 38,072 (we said 1,283) and Russia 48,385 (we said 1,912). Not a record: Iran's 7-day count ranked 13th of 32 rolling 7-day periods since 1 Aug. Turkey's count did not fall from 148; it was flat (1,930 to 1,949 over six-day windows). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-09',
    status: 'draft',
    classification: 'false',
    text: "On 9 Sep 2026 we wrote “OONI recorded 1,359 confirmed blocking measurements in Iran over the last seven days, the…”. Until 12 Sep our collector kept one hour of each day, so our figure was far too low: OONI's 6-day total for Iran was 41,764 (we said 1,359). Of the 23 countries we checked, Russia (47,459), not Iran, had the highest count; Iran was second. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-13',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 13 Sep 2026 we wrote “Russia and Iran hit record censorship in the same week”. Not a record for Russia: its 7-day count ranked 6th of 37 rolling 7-day periods since 1 Aug and its blocked share (4.6%) 11th. Iran's count and blocked share (30.5%) were the highest since 1 Aug, but our “record” compared them with stored data that until 12 Sep held one hour per day. Afghanistan: we said 66; OONI's 6-day total was 2. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-14',
    status: 'draft',
    classification: 'misleading',
    text: "On 14 Sep 2026 we wrote “This is the largest simultaneous censorship spike we have on record for both states in the same…”. Russia's count rose 6% but its blocked share fell (4.7% to 4.5%). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-15',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 15 Sep 2026 we wrote “Russia and Iran log record censorship; 65 calls settle”. Not a record: Russia's 7-day count ranked 6th of 39 rolling 7-day periods since 1 Aug and its blocked share (4.5%) 18th. Iran's count was its highest since 1 Aug, but its blocked share (30.3%) ranked 3rd. We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-16',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 16 Sep 2026 we wrote “Russia and Iran hit record censorship in the same week”. Not a record: Russia's 7-day count ranked 13th of 40 rolling 7-day periods since 1 Aug and its blocked share (4.2%) 29th. Iran's count was its highest since 1 Aug, but its blocked share (30.4%) ranked 3rd. We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-17',
    status: 'draft',
    classification: 'false',
    text: "On 17 Sep 2026 we wrote “…censorship levels in the same week — and they're both at record volume for this year”. Not a record: Iran's 7-day count ranked 3rd of 41 rolling 7-day periods since 1 Aug and its blocked share (30.5%) 2nd; Russia's count ranked 6th and its blocked share (4.2%) 29th. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-19',
    status: 'draft',
    classification: 'misleading',
    text: 'On 19 Sep 2026 we wrote “Russia and Iran are running the two highest sustained censorship operations we track — 48,162…”. Russia led on count, but 4.0% of its tests were confirmed blocked, against 30.5% in Iran. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.',
  },
  {
    date: '2026-09-20',
    status: 'draft',
    classification: 'false',
    text: "On 20 Sep 2026 we wrote “…over 90,000 confirmed network blocks in seven days, the heaviest combined censorship load we've…”. Not a record: Iran's 7-day count ranked 9th of 44 rolling 7-day periods since 1 Aug and its blocked share (30.3%) 7th; Russia's count ranked 26th and its blocked share (4.0%) 37th. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-21',
    status: 'draft',
    classification: 'false',
    text: "On 21 Sep 2026 we wrote “Russia and Iran are running the two largest censorship operations on record this week — and…”. Not a record: Iran's 7-day count ranked 12th of 45 rolling 7-day periods since 1 Aug and its blocked share (30.4%) 7th; Russia's count ranked 28th and its blocked share (3.9%) 40th. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-22',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 22 Sep 2026 we wrote “Russia and Iran are running the two largest censorship operations we can measure, and both escalated this week”. Russia led on count, but 4.1% of its tests were confirmed blocked, against 30.2% in Iran. Neither escalated: Russia's count fell 7% and Iran's 10% week on week. We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-23',
    status: 'draft',
    classification: 'false',
    text: "On 23 Sep 2026 we wrote “…blocking measurements in the last seven days — the two highest totals we've logged in this…”. Not a record: Iran's 7-day count ranked 16th of 47 rolling 7-day periods since 1 Aug and its blocked share (30.3%) 9th; Russia's count ranked 19th and its blocked share (4.1%) 34th. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-25',
    status: 'draft',
    classification: 'false',
    text: "On 25 Sep 2026 we wrote “Iran's censorship surge is adjacent to Hormuz; Yemen (level 92, deviation flat at 0) is adjacent…”. No surge: Iran's count rose only 3% week on week. Of the 23 countries we checked, Russia (48,220), not Iran, had the highest count; Iran was second (44,802). We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-27',
    status: 'draft',
    classification: 'false',
    text: "On 27 Sep 2026 we wrote “This was a week of sustained rather than spiking control — Iran and Russia both held network…”. Iran was below 46,000 in three of the seven weeks (35,424, 43,931 and 40,259 in the weeks to 14 Aug, 21 Aug and 4 Sep), so there was no seven-week run. China's count was 348, then 339 (−3%); we had written that the prior week was above 1,000. We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-28',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 28 Sep 2026 we wrote “Russia and Iran just logged the highest concurrent censorship loads we've measured in a single week”. Not a record: Russia's 7-day count ranked 3rd of 52 rolling 7-day periods since 1 Aug and its blocked share (4.4%) 21st. Iran's blocked share (30.9%) was its highest since 1 Aug; its count ranked 2nd. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-29',
    status: 'draft',
    classification: 'misleading',
    text: "On 29 Sep 2026 we wrote “Russia and Iran just hit their highest censorship measurement in weeks — 55,404 confirmed blocks…”. Russia's count was its highest since 1 Aug, but its blocked share (4.5%) ranked 15th of 53 rolling 7-day periods. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-09-30',
    status: 'draft',
    classification: 'false',
    text: "On 30 Sep 2026 we wrote “Russia and Iran both held network interference above record territory this week — OONI recorded…”. Not a record: Russia's 7-day count ranked 2nd of 54 rolling 7-day periods since 1 Aug and its blocked share (4.5%) 19th. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-01',
    status: 'draft',
    classification: 'misleading',
    text: 'On 1 Oct 2026 we wrote “Russia and Iran recorded the highest censorship measurements globally this week — 53,665…”. Russia led on count, but 4.4% of its tests were confirmed blocked, against 32.7% in Iran. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.',
  },
  {
    date: '2026-10-02',
    status: 'draft',
    classification: 'false',
    text: "On 2 Oct 2026 we wrote “Russia and Iran hit record censorship in the same week — 51,895 confirmed blocks in Russia and…”. Not a record: Russia's 7-day count ranked 5th of 56 rolling 7-day periods since 1 Aug and its blocked share (4.4%) 25th. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-04',
    status: 'draft',
    classification: 'false',
    text: "On 4 Oct 2026 we wrote “…window — that's sustained network interference at the highest level we've recorded this year”. Not a record: Russia's 7-day count ranked 20th of 58 rolling 7-day periods since 1 Aug and its blocked share (4.2%) 40th. No surge: Russia's count fell 8% week on week. We also wrote “If OONI blocking sustains above 40,000 confirmed measurements per day for a tenth consecutive day…”. Iran's daily confirmed counts for 28 Sep to 3 Oct were 8,103 to 10,425, Russia's 7,881 to 9,587; 40,000 is closer to a week's total than a day's (6-day totals: Iran 52,561, Russia 50,455). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-06',
    status: 'draft',
    classification: 'false',
    text: "On 6 Oct 2026 we wrote “…50,000 confirmed network blocks this week — the two highest censorship measurements in the OONI…”. Not a record: Iran's 7-day count ranked 3rd of 60 rolling 7-day periods since 1 Aug and its blocked share (33.4%) 3rd; Russia's count ranked 25th and its blocked share (4.2%) 40th. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-07',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 7 Oct 2026 we wrote “Iran and Russia are running the highest censorship measurements we've seen in the same 7-day…”. Not a record: Russia's 7-day count ranked 31st of 61 rolling 7-day periods since 1 Aug and its blocked share (4.2%) 43rd. Iran's blocked share (34.0%) was its highest since 1 Aug; its count ranked 3rd. We also wrote that “OONI records every connection attempt that gets a block page or timeout”. The figures we cited were OONI's confirmed count only; OONI's data reports anomalies and failures separately. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-08',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 8 Oct 2026 we wrote “67 calls settle — 24 hit, 43 miss — and Iran hits 42,000 blocks”. We said “seven days”, but our data at that point covered five; OONI's full seven-day totals were Iran 61,004 and Russia 57,580. The 12 and 19.2 we cited elsewhere in that edition are our risk-score points, not OONI measurements; Russia's count fell 6%. Iran's count was 1.08 times Russia's, not triple. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-10',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 10 Oct 2026 we wrote “…censorship: 50,721 OONI-confirmed blocks in 7 days, the highest absolute measurement in the…”. Not a record: Russia's 7-day count ranked 25th of 64 rolling 7-day periods since 1 Aug and its blocked share (4.3%) 29th. Iran's blocked share (35.3%) was its highest since 1 Aug; its count ranked 2nd. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-11',
    status: 'draft',
    classification: 'false',
    text: "On 11 Oct 2026 we wrote “Russia and Iran hold record censorship — ICC designated”. Not a record: Iran's 7-day count ranked 8th of 65 rolling 7-day periods since 1 Aug and its blocked share (35.2%) 2nd; Russia's count ranked 11th and its blocked share (4.4%) 24th. We also wrote that Thailand's count “dropped by 75% week-over-week” and was down from “sustained levels above 1,000/week”. It rose 2% (250 to 256), and no six-day total from 1 Aug to 10 Oct exceeded 443. We also said Russia's blocks spanned Telegram, VPN endpoints and news sites; OONI's totals carry no such breakdown. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-12',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 12 Oct 2026 we wrote “Russia and Iran just logged the two highest censorship weeks we've measured”. Not a record: Russia's 7-day count ranked 4th of 66 rolling 7-day periods since 1 Aug and its blocked share (4.5%) 19th. Iran's blocked share (35.6%) was its highest since 1 Aug; its count ranked 9th. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-13',
    status: 'draft',
    classification: 'misleading',
    text: "On 13 Oct 2026 we wrote “Russia 68 (▼-8) — OONI recorded 46,587 confirmed blocking measurements over the past seven days,…”. We said “seven days”, but our data at that point covered five. We printed Russia 46,587, Iran 42,291, Cuba 377 and Myanmar 159; OONI's full seven-day totals were Russia 65,260, Iran 58,735, Cuba 508 and Myanmar 240. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-14',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 14 Oct 2026 we wrote “Russia and Iran are running record censorship in the same week — and the divergence matters”. Not a record: Iran's 7-day count ranked 12th of 68 rolling 7-day periods since 1 Aug and its blocked share (34.5%) 6th. Russia's count was its highest since 1 Aug, but its blocked share (4.7%) ranked 5th. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-15',
    status: 'draft',
    classification: 'false',
    text: "On 15 Oct 2026 we wrote “Russia and Iran just posted their highest censorship weeks in the dataset — 56,732 and 43,313…”. Not a record: Iran's 7-day count ranked 24th of 69 rolling 7-day periods since 1 Aug and its blocked share (33.9%) 9th; Russia's count ranked 2nd and its blocked share (4.7%) 7th. We also referred to “Iran's censorship spike”. Iran's count fell 18% week on week (53,143 to 43,649). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-16',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 16 Oct 2026 we wrote “…logged 58,064 confirmed OONI blocks in seven days — the highest absolute measurement in the…”. Russia's count was its highest since 1 Aug, but its blocked share (4.7%) ranked 6th of 70 rolling 7-day periods. We also called Iran's count steady; it fell 17% week on week. We also called test measurements “blocks”. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-17',
    status: 'draft',
    classification: 'false',
    text: "On 17 Oct 2026 we wrote “Cuba's +5 deviation move (7 → 12) aligns with the banking designation and 316 confirmed blocks…”. No surge: Cuba's count fell 17% week on week. We also described Iran's blocking as sustained; its count fell 22%. We also called test measurements “blocks”. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-18',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 18 Oct 2026 we wrote “OONI recorded 46,905 confirmed blocks in Russia and 36,247 in Iran over seven days — the highest…”. Not a record: Iran's 7-day count ranked 50th of 72 rolling 7-day periods since 1 Aug and its blocked share (30.6%) 23rd; Russia's count ranked 5th and its blocked share (4.6%) 13th. We said “seven days”, but our Russia figure covered five days and our Iran figure six; OONI's full seven-day totals were Russia 65,298 and Iran 43,998. We also wrote that Iran's blocking was “sustained”; its count fell 28% week on week (50,808 to 36,416). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-19',
    status: 'draft',
    classification: 'false',
    text: "On 19 Oct 2026 we wrote “OONI recorded 31,532 confirmed blocking measurements in the last seven days — ten times Russia's…”. Iran's count was 0.6 times Russia's, not ten times. No surge: Bangladesh's count fell 89% week on week. We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-21',
    status: 'draft',
    classification: 'false',
    text: "On 21 Oct 2026 our subject line said “68 forecasts settled today — Uganda hit, 67 miss”; our own ledger in that brief recorded 68 settled, 14 hit and 54 missed. We also wrote “What it means: Iran's external financing channels are narrowing fast, and the blocking surge…”. No surge: Iran's count fell 32% week on week; Russia's fell 6%. We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-22',
    status: 'draft',
    classification: 'false',
    text: "On 22 Oct 2026 we wrote “When sanctions enforcement and network interference both run hot for a week straight, it's a…”. It did not hold: Iran's count fell 29% week on week. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-23',
    status: 'draft',
    classification: 'false',
    text: "On 23 Oct 2026 we wrote “China hit by M7.0 quake as Russia and Iran sustain blocking surges”. No surge: Iran's count fell 26% week on week; Russia's fell 11%. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-24',
    status: 'draft',
    classification: 'false',
    text: "On 24 Oct 2026 we wrote “Russia and Iran just hit the highest censorship levels we've recorded in a single week”. Not a record: Iran's 7-day count ranked 78th of 78 rolling 7-day periods since 1 Aug and its blocked share (26.4%) 78th; Russia's count ranked 34th and its blocked share (4.0%) 71st. We also described Iran's blocking as “sustained” and a “spike”; its count fell 21% week on week (36,416 to 28,881) and its blocked share from 29.7% to 26.4%. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-25',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 25 Oct 2026 we wrote “…acute events — Iran's network blocking held steady at the highest level we've tracked, Russia's…”. Not a record: Iran's 7-day count ranked 78th of 79 rolling 7-day periods since 1 Aug and its blocked share (26.5%) 78th; Russia's count ranked 28th and its blocked share (4.0%) 71st. We said “seven days”, but our data at that point covered five. We printed Iran 25,663 and Russia 41,501; OONI's full seven-day totals were Iran 33,318 and Russia 59,190. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-26',
    status: 'draft',
    classification: 'misleading',
    text: "On 26 Oct 2026 we wrote “Whether the India censorship spike is federal or state-level coordination — OONI measures…”. India's count rose 6% but its blocked share fell (2.1% to 1.9%). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-27',
    status: 'draft',
    classification: 'false',
    text: "On 27 Oct 2026 we wrote “Venezuela's +6 rise to 78 — OONI logged only 6 measurements through October 25th, down from…”. It did not fall: Venezuela's count rose 50% week on week (4 to 6). We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-28',
    status: 'draft',
    classification: 'false',
    text: "On 28 Oct 2026 we wrote “Russia just logged its highest week of network interference in our archive, and Iran is running…”. Not a record: Russia's 7-day count ranked 8th of 82 rolling 7-day periods since 1 Aug and its blocked share (4.3%) 42nd; Iran's count ranked 82nd and its blocked share (26.4%) 82nd. We also wrote that both countries were blocking “at more than double their prior weekly pace”. Iran's count fell 14% (29,692 to 25,666); Russia's rose 4% (52,483 to 54,799). We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-29',
    status: 'draft',
    classification: 'false',
    text: "On 29 Oct 2026 we wrote “India's censorship trajectory crossed Turkey's this week — 3,977 confirmed blocks versus…”. India's count (3,978) stayed below Turkey's (4,396) and fell 10% week on week, so India neither crossed Turkey nor accelerated. OONI does not measure earthquakes; that cluster came from the USGS feed. We also called test measurements “blocks”. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-30',
    status: 'draft',
    classification: 'false',
    text: "On 30 Oct 2026 we wrote “Russia and Iran just hit record censorship in the same week — and we're watching what comes next”. Not a record: Iran's 7-day count ranked 84th of 84 rolling 7-day periods since 1 Aug and its blocked share (25.2%) 84th; Russia's count ranked 7th and its blocked share (4.4%) 35th. We also wrote “The censorship spike (24,825 OONI measurements in 7d) is the story.” Iran's count fell 14% week on week (28,881 to 24,841). We also claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-10-31',
    status: 'draft',
    classification: 'false',
    text: "On 31 Oct 2026 we wrote “Iran censorship surge → OONI recorded 24,556 confirmed blocks in the last 7 days, the highest…”. Not a record: Iran's 7-day count ranked 84th of 85 rolling 7-day periods since 1 Aug and its blocked share (25.0%) 85th. No surge: Iran's count fell 18% week on week. We also called test measurements “blocks”. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-11-01',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 1 Nov 2026 we wrote “Russia and Iran log record censorship as Sudan ticks up”. Not a record: Iran's 7-day count ranked 84th of 86 rolling 7-day periods since 1 Aug and its blocked share (24.5%) 86th; Russia's count ranked 3rd and its blocked share (4.4%) 30th. We also wrote that Iran's count was “double the prior week's”; it fell 19% (30,513 to 24,643). We called Myanmar's blocking “sustained”; its count fell 45% (175 to 96). We also wrote that Saudi Arabia's 1,047 was “up from near-zero the prior period”. Its count rose 52% week on week, from 689 to 1,047, not from near zero. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-11-02',
    status: 'draft',
    classification: 'false',
    text: "On 2 Nov 2026 we wrote “Russia and Iran are running the highest confirmed censorship loads we've measured in a single week”. Not a record: Iran's 7-day count ranked 84th of 87 rolling 7-day periods since 1 Aug and its blocked share (24.4%) 87th; Russia's count ranked 19th and its blocked share (4.2%) 61st. We also wrote that Saudi Arabia's older blocks had “aged out” (its count rose 57%, 805 to 1,267); that Kenya's count was “down from prior week” (it rose from 6 to 21); and that Myanmar's was “rising 3 → 7 → 12” (it fell 71%, 175 to 50). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-11-03',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 3 Nov 2026 we wrote “…blocking measurements in the last seven days — OONI's highest recorded week for the country…”. Not a record: Iran's 7-day count ranked 83rd of 88 rolling 7-day periods since 1 Aug and its blocked share (24.8%) 86th. Iran's six-day count rose 7% but its six-day blocked share fell (26.5% to 24.7%). We also made claims about services and past patterns that OONI's totals cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-11-04',
    status: 'draft',
    classification: 'misleading',
    text: "On 4 Nov 2026 we wrote “The censorship surge has no corresponding wire headline in today's feed, and the 7-day…”. Iran's count rose 16% but its blocked share fell (25.6% to 25.0%). Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-11-05',
    status: 'draft',
    classification: 'false-and-misleading',
    text: "On 5 Nov 2026 we wrote “…54,468 confirmed blocking measurements in seven days — the highest weekly censorship count in…”. Not a record: Russia's 7-day count ranked 17th of 90 rolling 7-day periods since 1 Aug and its blocked share (4.2%) 59th. No surge: Russia's count fell 5% week on week. We also wrote that Iran's censorship component “spiked”: Iran's count rose 17% (24,841 to 29,067) but its blocked share was flat (25.2% to 25.1%). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-11-21',
    status: 'draft',
    classification: 'false',
    text: "On 21 Nov 2026 we wrote “India 49 (▼-5) — OONI recorded 4,413 confirmed blocks in the last 7 days, down from prior week's pace…”. It did not fall: India's count rose 8% week on week (4,085 to 4,413). We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
  {
    date: '2026-11-22',
    status: 'draft',
    classification: 'false',
    text: "On 22 Nov 2026 we wrote “Russia and Iran hit record censorship in the same week”. Not a record: Russia's 7-day count ranked 64th of 107 rolling 7-day periods since 1 Aug and its blocked share (3.7%) 103rd; Iran's count ranked 101st and its blocked share (21.7%) 107th. Their combined 7-day count (83,706) ranked 100th. We also called test measurements “blocks” and claimed motives the data cannot show. Original text unchanged. Source: OONI daily totals.",
  },
];

/**
 * The page's title and introduction. The draft's cause paragraph and its other
 * sections are owner choices still open, and are not here. Approve with
 * `status: 'approved'` plus `publishedOn: 'YYYY-MM-DD'`, INTRODUCTION_APPROVED
 * = true in corrections-approvals.ts, and INTRO_APPROVED = true in the test.
 * The first paragraph says each of the 49 carries a note, so the gate also
 * withholds the introduction until every note is approved by both keys. Until
 * then the page, once any note is approved, carries only the heading
 * "Corrections" and the approved notes.
 */
export const CORRECTIONS_PAGE_INTRO: CorrectionsPageIntro = {
  status: 'draft',
  title: 'Corrections to our censorship reporting, 8 September to 6 November 2026',
  paragraphs: [
    "Between 8 September and 6 November our daily brief, written by a language model from figures we supplied, made claims about internet censorship that were wrong. Most said that censorship in Russia and Iran had reached a “record”. It had not. We checked all 57 model-written editions from that period against OONI's published daily totals. 49 contain at least one false or misleading claim of fact: 42 contain at least one false claim, and 7 only misleading ones. Each of the 49 carries a dated note beside its original text, which we have not changed. The other 8 were wrong only in wording.",
    "OONI's count is the number of tests confirmed as blocked, so it rises when more tests are run. The share of tests confirmed blocked removes that effect. By that measure Russia stayed near 4% (between 3.95% and 4.72% in the weekly figures cited in our notes). Iran's was 29.6% in the week to 7 September, 35.6% in the week to 11 October (its highest of any week since 1 August up to that date) and 24.4% in the week to 1 November (its lowest up to that date).",
  ],
};
