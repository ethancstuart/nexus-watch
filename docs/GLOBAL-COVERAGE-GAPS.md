# Global Coverage Gaps — Work Queue for Track E.2

Machine-readable companion to `GLOBAL-COVERAGE-BASELINE.md`. Each entry is a concrete, actionable gap that Track E.2 can pick up.

Effort legend: **S** = ≤½ day, **M** = 1–2 days, **L** = 3–5 days.

---

## Oceania — highest priority (~20% coverage)

```yaml
- id: oceania-pic-weather
  layer: weather-alerts
  continent: oceania
  missing_countries: ["FJ", "WS", "TO", "VU", "SB", "FM", "MH", "PW", "NR", "KI", "TV", "PG", "NC", "PF"]
  action: add 8 PIC coordinates to MONITOR_POINTS in api/weather-alerts.ts
  recommended_source: "Open-Meteo (already wired, trivial extension)"
  effort: S

- id: oceania-pic-aqi
  layer: air-quality
  continent: oceania
  missing_countries: ["FJ", "WS", "TO", "VU", "SB", "PG", "NC", "PF"]
  action: add 6 PIC coordinates to CITIES list in api/air-quality.ts
  recommended_source: "Open-Meteo AQI"
  effort: S

- id: oceania-seismic
  layer: earthquakes
  continent: oceania
  missing_countries: []
  status: global via USGS — verify coverage completeness for <M5 Pacific events
  recommended_source: "NZ GeoNet, GeoScience Australia, NOAA PTWC"
  effort: M

- id: oceania-tsunami
  layer: gdacs
  continent: oceania
  gap: "GDACS has historical tsunami coverage but PIC-specific warnings are not surfaced"
  recommended_source: "NOAA PTWC CAP alerts → new api/tsunami.ts feed"
  effort: M

- id: oceania-elections
  layer: elections
  continent: oceania
  missing_countries: ["FJ", "PG", "SB", "VU", "NZ"]
  action: add 5 entries to electionLayer.ts curated list (use IFES calendar)
  recommended_source: "IFES Election Guide + Pacific Islands Forum calendar"
  effort: S

- id: oceania-cii-enable
  layer: countryInstabilityIndex
  continent: oceania
  missing_countries: ["AU", "NZ", "PG", "FJ", "SB", "VU"]
  action: add 6 entries to MONITORED_COUNTRIES after data feeds exist
  blocked_by: ["oceania-pic-weather", "oceania-tsunami", "oceania-elections"]
  effort: S
```

## South America — 2nd priority

```yaml
- id: samer-hazard-feeds
  layer: earthquakes
  continent: south-america
  missing_countries_partial: ["PY", "UY", "GY", "SR", "GF"]
  status: USGS is global — gap is in *regional* volcanic + geological hazard depth
  recommended_source: "SERNAGEOMIN (CL), SGC/INGEOMINAS (CO), CEMADEN (BR)"
  effort: M

- id: samer-fire-enhancement
  layer: fires
  continent: south-america
  gap: "Amazon + Pantanal fires are in NASA FIRMS but BR-specific context missing"
  recommended_source: "INPE TerraBrasilis (http://terrabrasilis.dpi.inpe.br/)"
  effort: M

- id: samer-election-expansion
  layer: elections
  continent: south-america
  missing_countries: ["PY", "UY", "GY", "SR", "EC", "PE"]
  recommended_source: "IFES + OEA election calendar"
  effort: S

- id: samer-cii-fill
  layer: countryInstabilityIndex
  continent: south-america
  missing_countries: ["CL", "PE", "EC", "PY", "UY", "BO"]
  action: add 6 S.Am entries to MONITORED_COUNTRIES (bringing S.Am to 9/12 — beats 80% gate)
  effort: S

- id: samer-disease-paho
  layer: disease-outbreaks
  continent: south-america
  gap: "WHO DON is slow for the Americas; PAHO releases are faster"
  recommended_source: "PAHO (https://www3.paho.org/) RSS feed"
  effort: M
```

## Africa — critical for global coverage but highest effort

```yaml
- id: africa-cdc
  layer: disease-outbreaks
  continent: africa
  missing_countries: ["ZW", "ZM", "BW", "NA", "GA", "CG", "CM", "GH", "SN", "CI", "LR", "SL"]
  action: new api/africa-cdc.ts edge function; merge into disease-outbreaks
  recommended_source: "Africa CDC Outbreak Tracker"
  effort: M

- id: africa-reliefweb
  layer: gdacs (augment)
  continent: africa
  missing_countries: "most Sub-Saharan non-conflict states"
  action: new api/reliefweb.ts edge function for humanitarian updates
  recommended_source: "ReliefWeb API (unauth, unlimited)"
  effort: S

- id: africa-fewsnet
  layer: new (food-security)
  continent: africa
  missing_countries: "Sahel + Horn"
  action: add 31st layer: FEWS NET famine early warning
  recommended_source: "https://fews.net/ KML feed"
  effort: M

- id: africa-acled-window-expansion
  layer: acled
  continent: africa
  gap: "GDELT fallback caps coverage at 24 countries; live ACLED should cover 50+"
  action: verify ACLED upstream is wired in cron; remove reliance on fallback
  recommended_source: "ACLED (already wired, fix broken path)"
  effort: S

- id: africa-weather-expansion
  layer: weather-alerts
  continent: africa
  missing_countries: ["MA", "DZ", "TN", "SN", "CI", "GH", "AO", "MZ", "MG", "ZW", "SD", "UG", "TZ", "CM"]
  action: add 14 African cities to MONITOR_POINTS
  effort: S

- id: africa-aqi-expansion
  layer: air-quality
  continent: africa
  missing_countries: ["SN", "CI", "UG", "TZ", "ZW", "AO", "CM", "CD"]
  action: add 8 African cities
  effort: S

- id: africa-cii-fill
  layer: countryInstabilityIndex
  continent: africa
  missing_countries: ["GH", "CI", "SN", "CM", "AO", "MZ", "ZM", "ZW", "TZ", "RW", "BI", "GN", "NE", "BJ"]
  action: add 14 African entries
  effort: S
```

## Asia — mostly Central Asia gap

```yaml
- id: asia-central-asia-cii
  layer: countryInstabilityIndex
  continent: asia
  missing_countries: ["KZ", "UZ", "TM", "KG", "TJ", "MN", "AZ", "GE", "AM"]
  action: add 9 CIS/Caucasus entries (Tier 2 or 3)
  effort: S

- id: asia-se-asia-cii
  layer: countryInstabilityIndex
  continent: asia
  missing_countries: ["TH", "VN", "MY", "LA", "KH", "NP", "LK", "BD"]
  action: add 8 entries (BD, LK already in via radius)
  effort: S

- id: asia-jma-typhoons
  layer: gdacs (augment)
  continent: asia
  gap: "JMA typhoon tracks are faster than GDACS relays"
  recommended_source: "JMA bosai JSON feed"
  effort: S

- id: asia-phivolcs
  layer: earthquakes (augment)
  continent: asia
  recommended_source: "PhiVolcs RSS"
  effort: S

- id: asia-imd
  layer: weather-alerts
  continent: asia
  missing_countries: ["NP", "BT", "LK", "MV"]
  action: add 4 South Asian cities + IMD cyclone watch
  recommended_source: "Open-Meteo (S) + IMD tropical cyclone tracker (M)"
  effort: S
```

## Europe — mostly small-country CII fills

```yaml
- id: europe-cii-mid-tier
  layer: countryInstabilityIndex
  continent: europe
  missing_countries: ["IT", "ES", "NL", "BE", "CH", "AT", "PT", "GR", "PL", "CZ", "HU", "RO", "BG", "HR", "FI", "SE", "NO", "DK", "IE", "RS", "BA"]
  action: add 21 European entries (CII goes from 5 EU → 26)
  effort: S

- id: europe-ecmwf
  layer: weather-alerts
  continent: europe
  gap: "Open-Meteo is adequate; ECMWF would be nicer but not blocking"
  recommended_source: "ECMWF Open Data"
  effort: M

- id: europe-copernicus-ems
  layer: fires (augment) + gdacs
  continent: europe
  gap: "Wildfires + floods within EU have faster Copernicus alerts"
  recommended_source: "Copernicus EMS"
  effort: M
```

## North America / Caribbean

```yaml
- id: namer-central-america-cii
  layer: countryInstabilityIndex
  continent: north-america
  missing_countries: ["GT", "HN", "SV", "NI", "CR", "PA", "BZ"]
  action: add 7 Central American entries
  effort: S

- id: namer-caribbean-cdema
  layer: new
  continent: north-america
  missing_countries: ["JM", "DO", "TT", "BS", "BB", "LC", "GD", "AG", "VC", "DM", "KN"]
  action: new api/cdema.ts — hazard alerts for Caribbean states
  recommended_source: "CDEMA RSS"
  effort: S

- id: namer-cenapred-mexico
  layer: gdacs (augment)
  continent: north-america
  action: fold CENAPRED feeds into GDACS aggregation
  recommended_source: "CENAPRED (MX)"
  effort: M
```

---

## Cross-cutting fixes (not country-specific)

```yaml
- id: fix-cii-stale-countryindex
  file: src/services/countryIndex.ts
  issue: "23-country legacy CII is still referenced by CLAUDE.md; the real one in countryInstabilityIndex.ts has 50"
  action: delete old countryIndex.ts or merge into new; update CLAUDE.md
  effort: S

- id: fix-interests-service-missing
  file: src/services/interests.ts
  issue: "CLAUDE.md references this file but it does not exist"
  action: create new service for Track F onboarding (see baseline §7 taxonomy)
  effort: M
  owner: Track F

- id: add-population-weighting
  file: src/services/countryInstabilityIndex.ts
  action: add popWeight() utility per baseline §6 formula; apply per-component per §6 table
  effort: S

- id: cii-expansion-85-countries
  file: src/services/countryInstabilityIndex.ts
  action: grow MONITORED_COUNTRIES from 50 → 85+ per baseline §5 tier plan
  effort: M
  note: "Pair with population-weighting to prevent noise from small countries"

- id: onboarding-continent-picker
  file: src/ui/onboardingOverlay.ts (replace with full flow)
  action: build real interests picker — 6 continents + 12 subregions + 10 themes
  effort: M
  owner: Track F
  depends_on: [fix-interests-service-missing]

- id: news-layer-coverage-instrumentation
  file: api/gdelt.ts + cron
  action: log per-request distribution of sourceCountry codes; expose /api/coverage-stats endpoint
  effort: S
  purpose: "Prove CII gate is met in production, not just in the audit"

- id: sanctions-auto-refresh
  file: api/sanctions (new) or src/map/layers/sanctionsLayer.ts
  action: wire weekly cron against US Treasury SDN CSV
  effort: M
  priority: low
```

---

## Effort roll-up

| Bucket | S | M | L | Total |
|---|---|---|---|---|
| Oceania | 4 | 2 | 0 | 6 |
| S. America | 2 | 3 | 0 | 5 |
| Africa | 4 | 2 | 0 | 6 |
| Asia | 4 | 1 | 0 | 5 |
| Europe | 1 | 2 | 0 | 3 |
| N. America / Caribbean | 2 | 1 | 0 | 3 |
| Cross-cutting | 4 | 3 | 0 | 7 |
| **Totals** | **21** | **14** | **0** | **35** |

At ~½ day per S and ~1.5 days per M, that's **~32 dev-days** total if executed serially, but the majority can parallelize. Recommend splitting Track E.2 into **E.2.a (coverage expansion)** and **E.2.b (CII + weighting rework)** and running in parallel with a shared integration point at the end.

---

## Gate verification checklist

Before Track E is considered done:

- [ ] Every continent has at least one curated layer with ≥80% of its quota represented
- [ ] CII includes ≥80 countries spread across 6 continents
- [ ] Oceania has at least 1 live hazard feed (PTWC or PacIOOS)
- [ ] Africa has a non-WHO disease channel
- [ ] S.Am has at least 2 regional science feeds (CL + BR minimum)
- [ ] Onboarding interests picker lists all 6 continents
- [ ] Population-weighting applied to CII disaster + infrastructure components
- [ ] `/api/coverage-stats` endpoint returns per-continent layer counts (or equivalent)
- [ ] No core layer is solely dependent on a 15-year-old curated TS file
