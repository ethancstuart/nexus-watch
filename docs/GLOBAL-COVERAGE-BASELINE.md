# Global Coverage Baseline Audit — Track E.1

**Author:** Track E.1 agent
**Date:** 2026-04-11
**Scope:** NexusWatch v5 completion plan — Track E (Global Data Coverage)
**Mandate:** Audit current continent-level coverage across all 30 data layers and recommend fills to achieve **≥80% core-layer coverage on every continent**.

Continent quotas from the plan (195 countries + OCTs):

| Continent | Target |
|---|---|
| Africa | 54 |
| Asia | 48 |
| Europe | 44 |
| North America | 23 |
| South America | 12 |
| Oceania | 14 |

---

## 1. Executive Summary

**Current state.** NexusWatch's 30 layers split cleanly into two groups: (a) ~12 layers backed by truly-global external feeds (USGS earthquakes, NASA FIRMS fires, GDACS, GDELT news/sentiment, OpenSky flights, AIS ships, CelesTrak satellites, Open-Meteo weather, UNHCR, WHO DON, Polymarket/Kalshi, Cloudflare Radar) that nominally cover all six continents, and (b) ~18 layers backed by hand-curated or keyword-geocoded lists that are heavily biased toward **North America + Europe + MENA**, with thin-to-zero representation of **Sub-Saharan Africa (non-conflict)**, **Latin America (non-Venezuela/Mexico/Colombia)**, **Oceania (Pacific islands)**, and **Central Asia / South Caucasus**. The Country Instability Index (CII in `src/services/countryInstabilityIndex.ts`) monitors **50 countries** — already above the 23 referenced in CLAUDE.md but still short of the 80+ target and is population/conflict-weighted rather than continent-balanced.

**Biggest gaps.** In descending order of severity: (1) **Oceania** is effectively uncovered — only AU, NZ, PG appear in any curated list, and the 11 Pacific Island OCTs/SIDS (FJ, WS, TO, VU, SB, FM, MH, PW, NR, KI, TV) have zero footprint in conflict, disaster fallback, elections, sentiment, or CII; (2) **South America** is under-represented — only BR, MX (N.A.), CO, VE, AR, PE, CL, EC, BO show up; PY, UY, SR, GY, GF have no coverage in curated layers; (3) **Sub-Saharan Africa non-crisis corridor** — Southern Africa (BW, NA, SZ, LS, MG, MU, KM, SC) and Atlantic Africa (GM, GW, CV, ST, GQ, GA, CG) have essentially zero representation beyond what GDELT and GDACS happen to surface; (4) **Central Asia** — TM, TJ, KG, UZ absent from CII; (5) **Caribbean** — only CU, HT are tracked; JM, DO, TT, BS, BB are invisible.

**Priority order for Track E.2 fill work.**
1. **Expand CII monitored list to 85 countries** (rebalance for quota, re-tier by depth — see §5).
2. **Add Africa CDC + ReliefWeb feeds** (disease, humanitarian crises) → unlocks non-WHO African coverage.
3. **Add PacIOOS / NOAA Pacific Tsunami + PNG/SPC feed integrations** → puts real data on Oceania.
4. **Add SERNAGEOMIN + INPE + CENAPRED regional science feeds** → unlocks Latin America hazard depth.
5. **Expand Open-Meteo AQI + weather monitor arrays to ≥8 cities per continent** (trivial, same API).
6. **Add onboarding interests picker rework** (continent-level + sub-region bucketing).
7. **Add GDELT per-continent sentiment partitioning** (derive from existing global feed — no new API).
8. **Population-weighting overlay** on CII so giant low-pop countries don't dominate.

---

## 2. Coverage Matrix (30 layers × 6 continents)

Scoring conventions:
- **global** — layer is backed by a truly-global feed with no hard-coded allow-list; coverage is data-dependent (100%).
- **N/A** — the layer has no country dimension at all (e.g., satellites orbit globally; trade routes are inter-continental arcs).
- **red** (R) = 0–20% quota covered / missing
- **amber** (A) = 20–60% quota covered / thin
- **green** (G) = 60–100% quota covered / adequate
- `n/54` etc. = hand-counted unique country codes observed in the layer or its backing API. Where a layer blends a curated list with a live global feed, I report the curated count and flag it (live).

| # | Layer | Africa (54) | Asia (48) | Europe (44) | N.Am (23) | S.Am (12) | Oceania (14) |
|---|---|---|---|---|---|---|---|
| 1 | Earthquakes (USGS) | global (G) | global (G) | global (G) | global (G) | global (G) | global (G) |
| 2 | Wildfires (NASA FIRMS) | global (G) | global (G) | global (G) | global (G) | global (G) | global (G) |
| 3 | GDACS Disasters | global (G) | global (G) | global (G) | global (G) | global (G) | global (G) |
| 4 | Weather Alerts (Open-Meteo 47 cities) | 6/54 (A) | 13/48 (A) | 11/44 (G) | 2/23 (A) | 4/12 (G) | 3/14 (A) |
| 5 | Air Quality AQI (Open-Meteo 48 cities) | 7/54 (A) | 18/48 (G) | 10/44 (A) | 2/23 (A) | 4/12 (G) | 2/14 (A) |
| 6 | GDELT News (Postgres cache) | global (A)\* | global (A)\* | global (G) | global (G) | global (A) | global (R) |
| 7 | News Sentiment (derived from GDELT) | global (A)\* | global (A)\* | global (G) | global (G) | global (A) | global (R) |
| 8 | ACLED Live Conflicts (GDELT-geocoded fallback) | 7/54 country table (A) | 9/48 (A) | 3/44 (R) | 1/23 (R) | 0/12 (R) | 0/14 (R) |
| 9 | Conflict Zones (curated 26) | 12/54 (A) | 7/48 (R) | 1/44 (R) | 2/23 (R) | 2/12 (A) | 1/14 (R) |
| 10 | Frontlines (5 theaters) | 2/54 (R) | 1/48 (R) | 1/44 (R) | 0/23 (R) | 0/12 (R) | 0/14 (R) |
| 11 | Military Bases (38 unique countries, 28 bases listed) | 6/54 (R) | 15/48 (A) | 13/44 (A) | 3/23 (A) | 2/12 (A) | 2/14 (R) |
| 12 | Nuclear Facilities (22 sites, 15 countries) | 0/54 (R) | 8/48 (R) | 4/44 (R) | 2/23 (A) | 0/12 (R) | 0/14 (R) |
| 13 | GPS Jamming Zones (11 curated) | 0/54 (R) | 5/48 (R) | 4/44 (R) | 0/23 (R) | 0/12 (R) | 0/14 (R) |
| 14 | Cyber Threat Corridors (12 curated) | 0/54 (R) | 6/48 (R) | 4/44 (R) | 1/23 (R) | 0/12 (R) | 0/14 (R) |
| 15 | OFAC Sanctions (curated 14) | 2/54 (R) | 6/48 (R) | 1/44 (R) | 2/23 (A) | 1/12 (A) | 0/14 (R) |
| 16 | Ship Tracking (AISStream global bbox) | global (G) | global (G) | global (G) | global (G) | global (G) | global (G) |
| 17 | Chokepoint Status (6 fixed) | 1/54 (R) | 3/48 (R) | 1/44 (R) | 1/23 (R) | 0/12 (R) | 0/14 (R) |
| 18 | Undersea Cables (~40 curated) | N/A (links) | N/A | N/A | N/A | N/A | N/A |
| 19 | Oil/Gas Pipelines (~30 curated) | 3/54 (R) | 10/48 (R) | 10/44 (A) | 3/23 (A) | 2/12 (A) | 0/14 (R) |
| 20 | Strategic Ports (18 curated) | 2/54 (R) | 7/48 (R) | 3/44 (R) | 2/23 (A) | 0/12 (R) | 0/14 (R) |
| 21 | Trade Routes (8 arcs) | N/A (arcs) | N/A | N/A | N/A | N/A | N/A |
| 22 | Space Launches (Launch Library 2) | 1/54 (R) | 4/48 (R) | 3/44 (R) | 2/23 (A) | 1/12 (A) | 1/14 (R) |
| 23 | Energy (oil/gas/refineries ~83 assets) | 7/54 (R) | 9/48 (A) | 5/44 (A) | 2/23 (A) | 3/12 (G) | 1/14 (R) |
| 24 | Live Aircraft (OpenSky) | global (G) | global (G) | global (G) | global (G) | global (G) | global (G) |
| 25 | Internet Outages (40 monitored countries) | 11/54 (A) | 15/48 (A) | 2/44 (R) | 3/23 (A) | 3/12 (G) | 0/14 (R) |
| 26 | Election Calendar (23 curated) | 5/54 (R) | 7/48 (R) | 5/44 (R) | 2/23 (A) | 4/12 (G) | 1/14 (R) |
| 27 | Refugee Displacement (UNHCR top 30 corridors) | 20/54 (G) | 14/48 (A) | 5/44 (R) | 3/23 (A) | 4/12 (G) | 0/14 (R) |
| 28 | Disease Outbreaks (WHO DON — 68-country geocoder) | 24/54 (G) | 18/48 (G) | 3/44 (R) | 4/23 (G) | 4/12 (G) | 0/14 (R) |
| 29 | Prediction Markets (Polymarket/Kalshi keyword geo) | 1/54 (R) | 7/48 (R) | 5/44 (R) | 2/23 (R) | 1/12 (R) | 0/14 (R) |
| 30 | Satellites (CelesTrak) | N/A | N/A | N/A | N/A | N/A | N/A |

\* GDELT global but tonally biased toward English-language sources → Africa/S.America underweight in *volume* even when *coverage* is nominally global.

**Blockers / audit caveats:**
- `src/map/layers/newsLayer.ts` pulls from a Postgres cache populated by a cron (not visible in this audit); live country distribution at runtime can't be measured from source.
- `ACLED` layer depends on `DATABASE_URL` + GDELT geocoding; the hard 24-country coordinate table in `api/acled.ts` is the effective cap when ACLED upstream is unavailable. Continental coverage is therefore variable — I reported the fallback bound, not the maximum-coverage ACLED bound.
- `satellites`, `cables`, `tradeRoutes` have no country dimension; marking them N/A is honest, not a gap.

---

## 3. Per-Continent Deep Dive

### 3.1 Africa (54 countries — target)

**Currently covered by ≥1 core layer:** ~30 countries mostly via GDACS/WHO/UNHCR pass-through and selective ACLED/internet-outage monitoring. Curated-layer representation is concentrated in: DZ, EG, LY, TN, MA, SD, SS, ET, SO, KE, UG, TZ, NG, ML, BF, NE, TD, CF, CD, CM, GH, SN, ZA, MZ, MG, RW, BI, AO, CI, GN, ZW.

**Zero-to-thin coverage:** BW, NA, SZ, LS (Southern cone non-ZA); GM, CV, GW, ST, GQ, GA, CG, BJ, TG (Atlantic/Gulf of Guinea non-NG); ER, DJ (partial), KM, SC, MU (Indian Ocean islands); SL, LR (only in WHO geocoder); MW (only WHO).

**Specifically missing from CII:** ZW, ZM, BW, NA, MG, MU, RW, BI, GA, CG, CM, GH, SN, CI, LR, SL, GM, GW, CV, ST, GQ, DJ, ER, KM, SC, MR, EH, LS, SZ, MW, AO — ~30 African countries with zero CII depth.

**Fill APIs:**
- **Africa CDC Outbreak Tracker** (https://africacdc.org/resources/rssnewsletter/ + https://africacdc.org/disease-outbreak/) — disease complement to WHO DON; continent-wide coverage; no auth.
- **ACLED Africa disaggregated dataset** (already wired) — verify window covers continent fully; default ACLED country coverage is 50/54, missing only ER, DJ, KM, SC historically.
- **ReliefWeb API** (https://api.reliefweb.int/v1/reports?appname=nexuswatch&filter\[field\]=primary_country.iso3&filter\[value\]=...) — humanitarian updates per country, no auth, unlimited.
- **AFRILABS + Afrobarometer** — governance sentiment signal (quarterly, very slow).
- **WorldPop (Oxford)** — population density rasters; used for population-weighting CII, not live.
- **FEWS NET** (https://fews.net/) — USAID famine early-warning, Africa + Central Am + parts of SE Asia.

### 3.2 Asia (48 countries — target)

**Currently covered by ≥1 core layer:** ~32 countries. Strong in conflict/MENA belt (IR, IQ, SY, LB, IL, PS, YE, SA, JO, EG-on-border, AF, PK, BD, IN, LK, MM, TH, VN, ID, MY, PH, SG, CN, TW, HK, KR, KP, JP). Plus AE, QA, BH, KW, OM in ports/energy.

**Zero-to-thin coverage:** TM, TJ, KG, UZ, KZ (except energy), MN, BT, NP, MV, BN, LA, KH, TL; CY (often lumped with EU). Caucasus (AM, AZ, GE) only via ACLED/UNHCR edges.

**Specifically missing from CII:** AZ, GE, AM, KZ, UZ, KG, TJ, TM, MN, NP, BT, LK, MV, BN, LA, KH, TL, SG, MY, TH, VN, HK — CII has good MENA + China + SE Asia giants but misses most of the "stans" and mainland SE Asia non-giants.

**Fill APIs:**
- **JMA (Japan Meteorological Agency)** (https://www.jma.go.jp/bosai/forecast/data/forecast/) — typhoons, earthquakes, weather for Japan + N.Pacific.
- **CWB (Central Weather Bureau Taiwan)** — typhoon + seismic for TW.
- **PhiVolcs** (https://www.phivolcs.dost.gov.ph/) — seismic/volcanic for PH.
- **KMA (Korea Met Admin)** — seismic + typhoons for KR.
- **IMD (India Meteorological Dept)** (https://mausam.imd.gov.in/) — cyclones + monsoons for IN/NP/BD/LK/MV.
- **RSOE EDIS** (https://rsoe-edis.org/) — pan-Asia disaster and emergency feed.
- **ADB Asian Development Observer + UNESCAP country briefs** — governance signal.
- **Asian Barometer** — governance/sentiment survey.

### 3.3 Europe (44 countries — target)

**Currently covered by ≥1 core layer:** ~28 countries via weather (11), sentiment (via GDELT), internet outages (UA, RU), nuclear (FR, GB, DE, UA), ports (DE, NL, RU, TR), elections (FR, DE, GB, NO, CZ). Strong on top-10 Europe.

**Zero-to-thin coverage:** CH, AT, BE, LU, IE, DK, FI, HR, SI, SK, BA, AL, MK, ME, RS, BG, HU, LV, LT, IS, MD, CY, MT (each absent from curated CII + most custom layers). Basically everything that isn't a G7/E-EU-5.

**Specifically missing from CII:** CH, AT, BE, NL, DK, FI, SE, NO, IE, IS, PT, GR, HU, CZ, SK, PL (wait — PL is listed), RO, BG, HR, SI, BA, RS, ME, MK, AL, MD, EE, LV, LT, LU, MT, CY, IS, AD, MC, LI, SM, VA.

**Fill APIs:**
- **ECMWF Open Data** (https://www.ecmwf.int/en/forecasts/datasets/open-data) — European medium-range weather; no auth.
- **Copernicus Emergency Management Service** (https://emergency.copernicus.eu/) — EU-wide disaster mapping, free API with attribution.
- **Copernicus Atmosphere Monitoring Service (CAMS)** — air quality & wildfire emissions (already partially via Open-Meteo).
- **EDGAR (EU Joint Research Centre)** — emissions + policy data.
- **CEDEFOP skill & labor market** — socioeconomic signal (slow-moving).
- **EU-LFS / Eurostat API** — economic series for market-exposure component.

### 3.4 North America (23 countries + OCTs — target)

**Currently covered:** US, CA, MX, CU, HT (via CII + conflict + disease), PA (ports), BS/BM/BB/etc. via GDACS pass-through only. Curated layers: 3–5 countries max.

**Zero-to-thin coverage:** All Central American states BZ, GT, SV, HN, NI, CR (except elections HN); all Caribbean except CU/HT: JM, DO, TT, BS, BB, AG, DM, GD, KN, LC, VC, BZ (OCTs: AW, CW, SX, PR, VI, BM, KY, TC, AI, MS, AN).

**Fill APIs:**
- **CENAPRED (Mexico)** (https://www.gob.mx/cenapred) — seismic, volcanic, civil protection.
- **SMN Mexico** — weather hazards.
- **CDEMA (Caribbean Disaster Emergency Management Agency)** (https://www.cdema.org/) — Caribbean-wide hazard alerts, RSS feed.
- **PAHO (Pan-American Health Org)** — disease complement to WHO DON for the Americas.
- **NHC Atlantic + EPAC (NOAA)** — hurricanes covering Central America + Caribbean; already implicit via Open-Meteo but dedicated storm-track feed would add signal.
- **CEPREDENAC** — Central American disaster prevention agency.

### 3.5 South America (12 countries — target)

**Currently covered:** BR, AR, CO, VE, PE, CL, BO, EC, UY (elections only). Curated-layer concentrations in BR, CO, VE.

**Zero-to-thin coverage:** PY, SR, GY, GF (French Guiana OCT). UY is touched only by elections. Internal provinces of BR/AR (Amazon, Patagonia) have zero hazard-mapping resolution.

**Fill APIs:**
- **SERNAGEOMIN (Chile Geological Survey)** (https://www.sernageomin.cl/) — seismic + volcanic; RSS feed.
- **INGEOMINAS / SGC (Colombia)** (https://www.sgc.gov.co/) — seismic + volcanic.
- **INPE (Brazil Space Research)** (https://terrabrasilis.dpi.inpe.br/) — Amazon deforestation, fires, land-use (supplements FIRMS for BR).
- **CONAF (Chile Forestry)** — wildfire feed.
- **CEMADEN (Brazil)** — natural disaster monitoring.
- **IBGE** — economic statistics for market-exposure.
- **RedULAC** — regional humanitarian.

### 3.6 Oceania (14 countries/OCTs — target)

Target set per plan: AU, NZ, PG, FJ, WS, TO, VU, SB, FM, MH, PW, NR, KI, TV (+ OCTs: NC, PF, NU, CK, TK, AS, GU, MP, WF).

**Currently covered:** AU (bases, weather, AQI, elections, energy — reasonable), NZ (weather, bases, launches), PG (one conflict line). GU (military base).

**Zero-to-thin coverage:** FJ, WS, TO, VU, SB, FM, MH, PW, NR, KI, TV — zero representation anywhere in the codebase. No CII entry, no hazard monitor point, no election tracking, no weather/AQI point.

This is the single biggest gap. With only ~3/14 covered, Oceania is at ~20% — far below the 80% gate.

**Fill APIs:**
- **GeoScience Australia** (https://earthquake.ga.gov.au/) — already fallback for USGS; covers AU + regional Pacific seismic.
- **PacIOOS (Pacific Islands Ocean Observing System)** (https://www.pacioos.hawaii.edu/) — oceanographic, wave, sea level, tsunami — free.
- **SPC (Pacific Community) Geoscience Division** — hazard data for PICs.
- **NOAA PTWC (Pacific Tsunami Warning Center)** — tsunami for the entire Pacific basin.
- **JOGMEC** — LNG/metals resource intel with Pacific nodes.
- **NZ GeoNet** (https://www.geonet.org.nz/) — NZ + Pacific seismic + volcanic.
- **VMGD (Vanuatu Meteo & Geohazards)**, **Fiji Met Service**, **BoM Australia** — national-level feeds bundled via the Pacific Island Climate Update Service (PI-CUS).
- **Open-Meteo** — already integrated; trivial to add 8 PIC coordinates to `api/weather-alerts.ts` MONITOR_POINTS.

---

## 4. Recommended Fill Sources (summary catalog)

For each entry: **name** | base URL | auth | expected coverage | effort (S/M/L).

### Africa
1. **Africa CDC Outbreak Tracker** — https://africacdc.org/disease-outbreak/ | none (RSS/HTML scrape) | 54/54 AU member states | M
2. **ReliefWeb API** — https://api.reliefweb.int/v1/reports | none | global humanitarian, AF bias | S
3. **FEWS NET** — https://fews.net/ | none (KML/HTML) | 35+ AF + CA + SE Asia | M
4. **WorldPop** — https://www.worldpop.org/ | none (raster download) | 200+ countries, used as weight only | L (static)

### Asia
5. **JMA Earthquake & Tsunami** — https://www.jma.go.jp/bosai/forecast/data/forecast/ | none | JP + N.Pacific | S
6. **PhiVolcs seismic RSS** — https://www.phivolcs.dost.gov.ph/ | none | PH | S
7. **CWB Taiwan** — https://opendata.cwa.gov.tw/ | free API key | TW | S
8. **IMD India** — https://mausam.imd.gov.in/ | none | IN, BD, LK, MV, NP (partial) | M
9. **RSOE EDIS** — https://rsoe-edis.org/ | none (RSS/JSON) | global, strong Asia | S

### Europe
10. **ECMWF Open Data** — https://www.ecmwf.int/en/forecasts/datasets/open-data | none | 44/44 EU | M
11. **Copernicus EMS** — https://emergency.copernicus.eu/ | free account | EU + neighbors | M
12. **Eurostat API** — https://ec.europa.eu/eurostat/api/ | none | 27 EU + EFTA | S

### North America / Caribbean
13. **CENAPRED** — https://www.gob.mx/cenapred | none | MX | M
14. **CDEMA** — https://www.cdema.org/ | none (RSS) | 19 Caribbean members | S
15. **PAHO** — https://www3.paho.org/ | none | 35 Americas | M
16. **NOAA NHC Atlantic/EPAC** — https://www.nhc.noaa.gov/ | none | Atl/EPac basin | S

### South America
17. **SERNAGEOMIN** — https://www.sernageomin.cl/ | none (RSS) | CL | S
18. **INGEOMINAS / SGC** — https://www.sgc.gov.co/ | none | CO | S
19. **INPE TerraBrasilis** — https://terrabrasilis.dpi.inpe.br/ | none (WMS) | BR | M
20. **CEMADEN** — https://www.cemaden.gov.br/ | none | BR | S

### Oceania
21. **GeoScience Australia (earthquake, tsunami, bushfire)** — https://earthquake.ga.gov.au/ + https://www.ga.gov.au/ | none | AU + SWP | S
22. **PacIOOS** — https://www.pacioos.hawaii.edu/ | none (ERDDAP) | all PICs + HI/GU | M
23. **NZ GeoNet** — https://www.geonet.org.nz/ | none | NZ + S.Pacific | S
24. **NOAA PTWC** — https://www.tsunami.gov/ | none (CAP alerts) | entire Pacific | S

### MENA (augment, not fill)
25. **ACLED windowed expansion** — https://acleddata.com/ | existing key | widen lookback window from 7d → 30d to include low-intensity events. (Source already wired; just config.)

**Totals:** 25 concrete APIs, spanning all 6 continents, effort mostly **S/M**. Aggregate integration budget estimated 4–6 dev-days assuming Track E.2 does not need bespoke parsers for HTML-only sources (which would push 2 of them from S→M).

---

## 5. CII Expansion Plan (23 → 85+ countries)

**Note:** CLAUDE.md says CII covers 23 nations, but `src/services/countryInstabilityIndex.ts` actually defines 50 (`MONITORED_COUNTRIES`). CLAUDE.md is stale — real baseline is **50**. Target: **85**.

### Tier 1 — Full depth (42 countries)
Top 40 by population + strategic importance, all components active:

`US, CN, IN, ID, PK, BR, NG, BD, RU, MX, JP, ET, PH, EG, VN, CD, IR, TR, DE, TH, GB, FR, IT, TZ, ZA, MM, KR, KE, CO, ES, UG, DZ, SD, IQ, CA, PL, MA, SA, UA, UZ, PE, AF` (42; +Ukraine/Afghanistan pulled forward by conflict weight).

### Tier 2 — Core feeds only (28 countries)
Conflict + disasters + sentiment + market exposure (skip governance details). Mid-tier by pop + regional geopol weight:

`VE, MY, NP, GH, YE, MZ, TW, CI, AO, CM, NE, SY, ML, LK, BF, CL, RO, KZ, MW, EC, ZM, GT, SN, CU, SO, TD, ZW, TN`

### Tier 3 — Events-only (15 countries)
CII entry shown only if an event triggers it; not recomputed on every cycle:

`RW, GN, BI, BJ, HT, SS, BY, JO, HN, CZ, GR, PT, HU, SE, FI`

### Oceania special addition (6 countries)
Even if thin, surface something:

`AU, NZ, PG, FJ, SB, VU`

**Total:** 42 + 28 + 15 + 6 = **91 CII entries** (59 new over current 50).

### Flagged thin-data countries (include with caveat)
- **North Korea (KP)** — already in CII; data exists but is largely inferred from external-source news (GDELT-biased). Keep.
- **Eritrea (ER), Turkmenistan (TM)** — minimal press, basically no real-time signal. Include in Tier 3 only with a "low-data" visual marker.
- **Small Pacific states (FM, MH, PW, NR, KI, TV, WS, TO)** — no live feeds. Keep *out* of CII until PacIOOS + NOAA PTWC are wired; populate only via hazard proxy for now. Do **not** bulk-add with zero signal — it would hurt CII credibility.
- **Micro-states (AD, MC, LI, SM, VA, MT)** — exclude from CII entirely. Mention only on map hovers if relevant.

---

## 6. Population-Weighting Recommendation

**Recommendation: yes, weight by population, but cap at p95 to prevent China/India domination.**

Rationale:
- An M6 earthquake in Papua New Guinea and an M6 in Japan score identically in the current CII geometry-only model. But a JP event affects 125M people and a PG event affects ~9M.
- Conversely, pure-pop weighting would make every China/India blip dominate the dashboard. Users watching Ukraine don't want China's 1.4B residents drowning out the signal.

**Proposed weighting function:**
```
weight(country) = clamp(log10(population) / log10(1e8), 0.5, 1.0)
```
This maps 1M-pop countries to 0.5x and 100M+ countries to 1.0x, so the spread is 2x — meaningful but bounded.

**Additional dimension: subscriber interest bias.** Once onboarding (Track F) collects continent selection, use it as a per-user overlay:
```
userCII = baseCII × (1.0 + 0.3 × hasInterest(continent))
```

**Geographic size** should NOT be weighted. A conflict in Belgium (30K km²) is as intelligence-relevant as a conflict in Kazakhstan (2.7M km²); the signal is about events-per-country, not events-per-km².

**Unrest impact per capita** is the right framing for disaster + disease components but NOT for conflict (where a single decapitation strike in PG matters regardless of population). Apply per-component:

| Component | Weight by population? |
|---|---|
| Conflict | No — absolute events |
| Disasters | Yes — severity × affected_pop |
| Sentiment | No — press-volume |
| Infrastructure | Partial — weight by pop-at-risk |
| Governance | No — binary state |
| Market Exposure | Yes — already implicit via GDP |

---

## 7. Onboarding Interests Picker Update

**Current state.** `src/ui/onboardingOverlay.ts` is a 49-line tooltip, not a real interests picker — it only shows a welcome card with text tips ("Middle East, Indo-Pacific, Energy Chokepoints"). There is **no functioning interests-capture UI** in this codebase yet. `src/services/watchlist.ts` offers a hardcoded default of 5 items (`Taiwan Strait, Ukraine, Iran, China, Red Sea`) but no region taxonomy. No `src/services/interests.ts` file exists (CLAUDE.md references one, but it's missing — another staleness flag).

Track F (onboarding) will therefore need to **build** the interests picker from scratch, not *update* one. This is actually easier: we can go straight to the right taxonomy.

### Recommended region taxonomy (6 continents + 12 sub-regions)

Flat top level (exact strings for the picker):

```ts
const CONTINENTS = [
  { id: 'africa',        label: 'Africa',        emoji: '🌍' },
  { id: 'asia',          label: 'Asia',          emoji: '🌏' },
  { id: 'europe',        label: 'Europe',        emoji: '🌍' },
  { id: 'north-america', label: 'North America', emoji: '🌎' },
  { id: 'south-america', label: 'South America', emoji: '🌎' },
  { id: 'oceania',       label: 'Oceania',       emoji: '🌏' },
];
```

Second level (optional sub-region bucketing, shown on hover/expand):

```ts
const SUBREGIONS = {
  africa: [
    'North Africa & MENA overlap',  // MA DZ TN LY EG SD
    'Sahel & West Africa',          // ML BF NE TD NG SN CI GH
    'East Africa & Horn',           // ET ER SO KE UG TZ RW BI SS DJ
    'Central Africa',               // CD CG CF CM GQ GA ST
    'Southern Africa',              // ZA ZW ZM MZ MW BW NA LS SZ AO
    'Indian Ocean Islands',         // MG MU SC KM
  ],
  asia: [
    'Middle East',                  // SA AE KW QA BH OM YE JO LB SY IQ IR IL PS TR
    'South Asia',                   // IN PK BD NP BT LK MV AF
    'Southeast Asia',               // ID TH VN PH MY SG MM KH LA BN TL
    'East Asia',                    // CN JP KR KP TW HK MO MN
    'Central Asia',                 // KZ UZ TM KG TJ
    'Caucasus',                     // GE AM AZ
  ],
  europe: [
    'Western Europe',               // DE FR GB NL BE LU IE CH AT
    'Northern Europe',              // NO SE FI DK IS EE LV LT
    'Southern Europe',              // IT ES PT GR MT CY
    'Central & Eastern Europe',     // PL CZ SK HU SI HR RS BA AL ME MK BG RO MD UA BY
    'Russia & Neighbours',          // RU (isolated)
  ],
  'north-america': [
    'USA & Canada',                 // US CA
    'Mexico',                       // MX
    'Central America',              // GT BZ SV HN NI CR PA
    'Caribbean',                    // CU HT DO JM TT BS BB +OCTs
  ],
  'south-america': [
    'Andean',                       // CO VE EC PE BO CL
    'Southern Cone',                // AR UY PY
    'Brazil',                       // BR
    'Guianas',                      // GY SR GF
  ],
  oceania: [
    'Australia & New Zealand',      // AU NZ
    'Melanesia',                    // PG FJ SB VU NC
    'Polynesia',                    // WS TO TV NU CK TK PF
    'Micronesia',                   // FM MH PW NR KI GU MP
  ],
};
```

**Thematic interests (orthogonal to regions)** — keep as a second picker step:

```ts
const THEMES = [
  'Armed conflict & insurgency',
  'Natural disasters & climate',
  'Disease outbreaks & health',
  'Energy & infrastructure',
  'Maritime & shipping',
  'Cyber & information warfare',
  'Elections & governance',
  'Markets & economic shocks',
  'Space & satellites',
  'Refugees & displacement',
];
```

A user selects 1..N continents and 1..N themes; their default Watchlist is auto-populated from the intersection (e.g. "Africa" + "Disease outbreaks" → preloads SD, ET, SS, CD, NG, UG, KE + disease keyword). Track F can refine.

---

## 8. Known Data-Quality Caveats

Be honest with the CEO: not every gap is fillable without degrading credibility.

1. **Micro-island CII scores will be noise.** Countries with <1M population and no press corps (TV, NR, KI, FM) will have CII scores dominated by random noise. Surface them only in dedicated "Oceania coverage" contexts; do not mix into the global CII leaderboard.

2. **WHO DON latency.** WHO Disease Outbreak News is often 2–6 weeks behind actual outbreaks. Africa CDC is faster but under-indexed. Fill will help *breadth*, not *latency*. Consider adding ProMED-mail RSS for earlier signal even though its text is ugly.

3. **ACLED Africa completeness.** ACLED officially covers 50/54 African states but the existing wiring uses GDELT keyword geocoding as a fallback. Under this fallback, coverage collapses to the 24-country `COUNTRY_COORDS` table in `api/acled.ts`. Fix: verify the ACLED path is live and the GDELT fallback is only a last resort (Track E.2 work).

4. **GDELT English-language bias.** Sentiment for non-English regions (CN, RU, AR, DZ, SA in Arabic, JP, KR, VN, ID, BR Portuguese) is systematically underweight and biased toward Anglosphere narrative. Do NOT weight sentiment heavily for those countries without fixing the source mix.

5. **Sanctions list freshness.** `sanctionsLayer.ts` is "curated 2026-04" — it will drift. Consider wiring to Treasury SDN CSV (https://www.treasury.gov/ofac/downloads/sdn.csv) on a weekly cron; otherwise mark as manually-maintained and audit every quarter.

6. **Prediction markets have zero Oceania/Africa signal.** Polymarket/Kalshi don't list questions about Fiji or Burkina Faso. Keyword geocoding caps at ~20 countries globally. This is a structural limitation of the source, not a bug.

7. **Oil & gas "market exposure" scores are stale.** `MARKET_RISK` table in CII is a hand-written constant; it doesn't reflect 2026 realities (e.g. AR inflation shock, TR lira devaluation recalibration). Flag for quarterly review.

8. **Pacific island filling risk.** Naively adding PIC countries to CII without backing data will push low-quality zero-scores onto the world map. Only surface them after PacIOOS + NOAA PTWC are wired; gate via a feature flag `INCLUDE_PICS` that defaults false until data exists.

9. **Central Asia ("the stans").** TM, TJ, UZ, KG have essentially no permissive press. Signal will be nearly all GDELT-translated (poor quality) + ACLED (patchy). Recommend Tier 3 events-only.

10. **Caribbean OCTs and micro-states.** Never include in CII. Surface only via map clicks → disease (PAHO) + hazard (CDEMA) popups.

---

## Appendix: Audit Methodology

Reviewed (read-only):
- All 30 files in `src/map/layers/`
- All 30 edge functions in `api/`
- `src/services/countryIndex.ts` (old, 23 countries)
- `src/services/countryInstabilityIndex.ts` (current, 50 countries)
- `src/services/watchlist.ts`
- `src/ui/onboardingOverlay.ts`
- `NEXUSWATCH-COMPLETION-PLAN.md` Track E scope
- `~/Projects/home-base/apis/catalog.md` (general; not NexusWatch-specific)

Did NOT run any cron, did NOT hit any live API, did NOT edit any source file.

Country counts for curated layers are exact (grepped for `country:` patterns). Country counts for API-sourced layers with hard-coded allow-lists are exact (e.g. 48-city AQI, 47-city weather, 40-country outages). Country counts for truly global feeds (USGS, FIRMS, GDACS, GDELT, UNHCR, WHO, OpenSky, AIS) are marked "global" — actual runtime coverage will depend on event occurrence.
