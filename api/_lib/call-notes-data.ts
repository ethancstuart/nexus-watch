/**
 * Dated notes on calls, and on two pages, that LEAVE EVERY VERDICT UNCHANGED.
 * DATA, NOT CODE.
 *
 * NOTHING IN THIS FILE IS SHOWN TO A READER UNTIL THE OWNER APPROVES IT. Every
 * surface reads it through api/_lib/call-notes.ts, whose gate passes on an
 * entry only when TWO keys agree: its status here is 'approved' with a real
 * issuedOn, AND its id is listed in APPROVED_NOTE_IDS in
 * api/_lib/call-notes-approvals.ts. The gate checks both on every request of
 * every deployment. (The integrity test also fails on a mismatch, but no
 * Vercel build runs the tests.)
 *
 * A NOTE IS NOT A CORRECTION. Nothing here is read by any scoring path, any
 * count, or call_corrections. /ledger counts a correction as a call we were
 * wrong about; it never counts a note.
 *
 * TO APPROVE ONE ENTRY, in one commit: change `status: 'draft'` to
 * `status: 'approved'` and add `issuedOn: 'YYYY-MM-DD'`, the date it goes live
 * (readers see "Note added D Mon YYYY." on a call and "Added D Mon YYYY." on
 * /methodology; the type refuses an approved entry without it); add its id to
 * APPROVED_NOTE_IDS in call-notes-approvals.ts; and add it to APPROVED_IDS in
 * call-notes-data.test.ts.
 * TO WITHDRAW ONE: set its status back to 'draft', delete its issuedOn line,
 * and remove its id from both lists.
 * NEVER PUSH A BRANCH CARRYING A TRIAL APPROVAL: every pushed branch gets a
 * public Vercel preview, which runs no tests.
 *
 * `text` is the note after its opening sentence, copied exactly from the
 * approved wording (lanes8/FX-WORDING.md §6, with FX-WORDING-CHECK R-1 and R-2
 * applied). The opening sentence is rendered from issuedOn, so the date is
 * never typed into the prose. In the 21 Nov made-on note, "{reference}" takes
 * the reference figure that call's claim states, from MADE_21_NOV_REFERENCES.
 *
 * Generated 2026-11-23 by lanes9/fx-notes-build/gen_data.py (kept outside this
 * repository): texts from FX-WORDING.md §6; call ids re-derived from
 * ledger-snapshots/2026-11-22.json by lanes9/fx-notes-build/derive_ids.py.
 * call-notes-data.test.ts re-derives every list from that snapshot. Edit by
 * hand from here on.
 */
import type { CallNote, ComputedNote, PageNote } from './call-note-words.js';

/**
 * The 27 currency calls resolved 21 Nov 2026 as HIT, in the 65 currencies
 * whose newest rate at issue that day was still the 20 Nov rate. All were made
 * 7 Nov.
 */
const RESOLVED_21_NOV_HIT: readonly number[] = [
  6048, 6050, 6051, 6052, 6053, 6054, 6055, 6057, 6058, 6061, 6062, 6064, 6075, 6076, 6078, 6079, 6082, 6087, 6088,
  6092, 6093, 6097, 6102, 6105, 6106, 6107, 6109,
];

/**
 * The 38 resolved 21 Nov 2026 as MISS, in the same 65 currencies. Not AZ 6049
 * (MISS), the 66th call resolved that day: Azerbaijan is unchecked
 * (FX-WORDING §7.6), so it carries no note.
 */
const RESOLVED_21_NOV_MISS: readonly number[] = [
  6045, 6046, 6047, 6056, 6059, 6060, 6063, 6065, 6066, 6067, 6068, 6069, 6070, 6071, 6072, 6073, 6074, 6077, 6080,
  6081, 6083, 6084, 6085, 6086, 6089, 6090, 6091, 6094, 6095, 6096, 6098, 6099, 6100, 6101, 6103, 6104, 6108, 6110,
];

/**
 * The 65 currency calls made 21 Nov 2026, each with the reference figure its
 * claim states ("… from <figure>."), exactly as the claim prints it.
 */
const MADE_21_NOV_REFERENCES: Readonly<Record<number, string>> = {
  6980: '65.1134',
  6981: '929.635',
  6982: '1562.99',
  6983: '1.49871',
  6984: '124.416',
  6985: '5.89320',
  6986: '1.43254',
  6987: '2312.36',
  6988: '0.843437',
  6989: '1007.79',
  6990: '3345.39',
  6991: '22.2535',
  6992: '137.097',
  6993: '53.8146',
  6994: '161.811',
  6995: '0.910749',
  6996: '0.762372',
  6997: '11.7835',
  6998: '338.090',
  6999: '18262.0',
  7000: '93.3727',
  7001: '1514.13',
  7002: '1.81120e+6',
  7003: '159.750',
  7004: '4066.65',
  7005: '1330.97',
  7006: '0.311124',
  7007: '449.862',
  7008: '332.636',
  7009: '6.46113',
  7010: '9.96194',
  7011: '2099.62',
  7012: '19.0293',
  7013: '4.11268',
  7014: '63.7725',
  7015: '1352.93',
  7016: '9.73453',
  7017: '149.394',
  7018: '1.82073',
  7019: '3.42988',
  7020: '63.7618',
  7021: '4.03210',
  7022: '4.86734',
  7023: '82.0218',
  7024: '1479.51',
  7025: '511.552',
  7026: '10.1827',
  7027: '1.29085',
  7028: '5808.74',
  7029: '121.722',
  7030: '33.9447',
  7031: '3.05382',
  7032: '50.5343',
  7033: '32.9866',
  7034: '2656.85',
  7035: '45.0988',
  7036: '4138.54',
  7037: '11967.5',
  7038: '918.766',
  7039: '25729.7',
  7040: '597.416',
  7041: '597.416',
  7042: '236.393',
  7043: '17.4096',
  7044: '26.5698',
};

/**
 * Every Zimbabwe currency call on the book on 22 Nov 2026: 92, of which 78
 * resolved (none a hit) and 14 open. Every claim names the code ZWL. A ZW call
 * made after 22 Nov carries the same note by ZW_AFTER_22_NOV below.
 */
const ZW_CALLS: readonly number[] = [
  91, 352, 996, 1100, 1204, 1308, 1412, 1477, 1542, 1607, 1672, 1736, 1800, 1865, 1930, 1995, 2061, 2141, 2207, 2271,
  2335, 2400, 2465, 2530, 2595, 2660, 2725, 2789, 2854, 2919, 2986, 3053, 3120, 3201, 3268, 3335, 3402, 3469, 3536,
  3603, 3670, 3737, 3804, 3871, 3938, 4006, 4074, 4141, 4208, 4289, 4356, 4423, 4490, 4557, 4624, 4691, 4758, 4825,
  4892, 4959, 5026, 5093, 5160, 5227, 5294, 5375, 5442, 5509, 5576, 5643, 5710, 5777, 5844, 5911, 5978, 6044, 6110,
  6176, 6242, 6308, 6374, 6454, 6520, 6586, 6652, 6718, 6784, 6849, 6914, 6979, 7044, 7109,
];

/**
 * R2 is "on every ZW call" (FX-WORDING 2B: "92 now, plus each new one while
 * the code stays ZWL"). So a currency call in ZW made after 22 Nov whose claim
 * names ZWL carries it too, through the same approval, dated the later of
 * issuedOn and the day the call was made. A relabelled claim (FX-WORDING 2C)
 * no longer names ZWL and so no longer carries it.
 */
const ZW_AFTER_22_NOV = {
  kind: 'fx_devaluation',
  countryCode: 'ZW',
  claimCode: 'ZWL',
  madeAfter: '2026-11-22',
} as const;

export const CALL_NOTES: readonly CallNote[] = [
  {
    id: 'fx-2026-11-21-resolved-miss',
    status: 'approved',
    issuedOn: '2026-11-23',
    scope: { ids: RESOLVED_21_NOV_MISS },
    text: "This call's window ended on 21 Nov 2026. When that day's calls were issued, the newest exchange rate we held for each of the 65 currencies we issue calls on was still the 20 Nov rate; all 65 changed on 22 Nov. This call's score is the one the rates from 7 to 20 Nov give. A missing day can turn a hit into a miss, never a miss into a hit. We do not know whether a 21 Nov rate would have made this call a hit. The published verdict is unchanged. Source: our stored daily exchange rates.",
  },
  {
    id: 'fx-2026-11-21-resolved-hit',
    status: 'approved',
    issuedOn: '2026-11-23',
    scope: { ids: RESOLVED_21_NOV_HIT },
    text: "This call's window ended on 21 Nov 2026. When that day's calls were issued, the newest exchange rate we held for each of the 65 currencies we issue calls on was still the 20 Nov rate; all 65 changed on 22 Nov. This call's score is the one the rates from 7 to 20 Nov give. A missing day can only turn a hit into a miss, so a 21 Nov rate could not have changed this hit. The published verdict is unchanged. Source: our stored daily exchange rates.",
  },
  {
    id: 'fx-2026-11-21-made',
    status: 'approved',
    issuedOn: '2026-11-23',
    scope: { ids: Object.keys(MADE_21_NOV_REFERENCES).map(Number) },
    references: MADE_21_NOV_REFERENCES,
    text: 'This call was made on 21 Nov 2026. The reference rate it states, {reference}, is the 20 Nov rate: no newer rate had reached us when the call was made. Rates changed again on 22 Nov. The claim, threshold and reference are unchanged. Source: our stored daily exchange rates.',
  },
  {
    id: 'fx-zw-zwl-label',
    status: 'approved',
    issuedOn: '2026-11-23',
    scope: { ids: ZW_CALLS, rule: ZW_AFTER_22_NOV },
    text: "This call names the currency ZWL, the code under which our rates source publishes this rate. On 16 and 22 Nov 2026 the source published the same rate under ZWG, the code of the ZiG: 26.5861 and 26.5872. We have not compared the two codes on any other day. The rate, threshold and verdict are unchanged. Source: our rates source's published quotes, 16 and 22 Nov 2026.",
  },
];

/**
 * Dated sections of /ledger, shown before the Corrections section, in this order.
 *
 * R1c is FX-WORDING's text with one sentence anchored to its date by the lead
 * (23 Nov 2026, after review REVIEW-9 finding 1): "It also falls inside the
 * windows of 780 open calls in these currencies, which have not yet been
 * scored." became the sentence below beginning "As of 22 Nov 2026". The 780
 * resolve from 23 Nov, so the unanchored present tense went stale the morning
 * the section was published.
 */
export const LEDGER_SECTIONS: readonly PageNote[] = [
  {
    id: 'ledger-fx-2026-11-21',
    status: 'approved',
    issuedOn: '2026-11-23',
    kicker: 'Exchange rates, 21 November 2026',
    heading: 'One day without new rates',
    paragraphs: [
      "On 21 Nov 2026, when that day's calls were issued, the newest exchange rate we held for each of the 65 currencies we issue calls on was still the 20 Nov rate. All 65 changed on 22 Nov. We do not know whether our collector or our source missed the day. Of the 66 calls that resolved on 21 Nov, the 65 in these currencies were scored that morning. Each score is the one the rates from 7 to 20 Nov give: 27 were published as hits and 38 as misses. A missing day can only turn a hit into a miss, so the 27 hits stand; we do not know whether any of the 38 misses would differ. 21 Nov also falls inside the windows of 65 of the 66 calls that resolved on 22 Nov, whose scores are the ones the rates of 8 to 20 Nov and 22 Nov give. As of 22 Nov 2026, it also fell inside the windows of 780 open calls in these currencies, which had not yet been scored. We have not yet checked our calls on Azerbaijan (AZN), the last of which was made on 17 Nov. The 65 calls made on 21 Nov state the 20 Nov rate as their reference. We have changed no verdict. On 22 Nov 2026 our FX skill was −3.0% with the 66 calls resolved on 21 Nov and −3.1% without them; every figure on this page counts them as published.",
    ],
  },
];

/**
 * The line under /ledger's FX row (FX-WORDING R3b). Its words are fixed in
 * call-note-words.ts (thresholdLineLead) and its figures are computed per
 * request by the stated rule; only its approval is data.
 */
export const LEDGER_FX_THRESHOLD_LINE: ComputedNote = {
  id: 'ledger-fx-threshold-line',
  status: 'approved',
  issuedOn: '2026-11-23',
};

/** Dated sections of /methodology, shown after "How the Ledger forecasts", in this order. */
export const METHODOLOGY_NOTES: readonly PageNote[] = [
  {
    id: 'methodology-fx-threshold',
    status: 'approved',
    issuedOn: '2026-11-23',
    heading: 'How a currency threshold is set, and what it does to the score',
    paragraphs: [
      "A currency call's threshold is the 75th percentile of that currency's 14-day peak depreciation over all the history we hold. So it is reached in about one window in four, and the base rate we score against is about 25%. Our probability gives one fifth of its weight to the 42 most recent complete windows. When a currency reaches its threshold less often than it used to, our probability falls below the base rate, and each miss scores better than the base rate. On 22 Nov 2026 four currencies were priced below their base rate on every resolved call and hit at most once: Sri Lanka (LKR), Venezuela (VES), Zimbabwe (the ZiG, which our source labels ZWL) and Ethiopia (ETB). Their 312 resolved calls include 1 hit. Five more currencies were priced below base rate on every call but hit 5 to 7 times each. Our FX skill on 22 Nov 2026 was −3.0% on 5,166 resolved calls, and −3.7% on the 4,854 calls outside the four. Measured fortnight by fortnight (five fortnights from 23 Aug, then the eight days to 8 Nov), the average fortnight's skill has a 95% interval of −7.2% to +4.0% for all calls and −8.0% to +3.4% without the four. Both include zero: neither figure shows skill. No call has been removed from any figure.",
    ],
  },
];
