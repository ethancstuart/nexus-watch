/**
 * Data Lineage Tracker
 *
 * Records every data hop: source API → fetch → quality filter →
 * storage → CII computation → UI display.
 *
 * Client-side in-memory tracker for immediate debugging and the
 * lineage viewer. Critical records also persist to the audit_log
 * table via /api/audit/record for long-term auditability.
 *
 * This is the infrastructure that turns "trust us" into "check our work."
 */

import type { LineageRecord, AuditLogEntry, QualityFilterStat } from '../types/lineage.ts';

// ---------------------------------------------------------------------------
// In-memory stores (last 100 records per type)
// ---------------------------------------------------------------------------

const MAX_RECORDS = 100;
const lineageRecords = new Map<string, LineageRecord>();
const auditEntries: AuditLogEntry[] = [];
let lineageIdCounter = 0;
let auditIdCounter = 0;

// ---------------------------------------------------------------------------
// Lineage recording
// ---------------------------------------------------------------------------

export interface RecordFetchInput {
  layerId: string;
  source: string;
  sourceUrl: string;
  responseStatus: number;
  fetchStartMs: number;
  fetchEndMs: number;
  responseSizeBytes: number;
  recordsReturned: number;
  recordsAccepted: number;
  qualityFilters?: QualityFilterStat[];
  sourceType?: LineageRecord['sourceType'];
  error?: string;
  previousRecordIds?: Array<string | number>; // for diff computation
  currentRecordIds?: Array<string | number>;
}

/**
 * Record a data fetch. Called by every layer's refresh() after
 * hitting an upstream API.
 */
export function recordFetch(input: RecordFetchInput): LineageRecord {
  const id = `ln-${Date.now()}-${++lineageIdCounter}`;

  // Compute diff if both previous and current record IDs provided
  let diff: LineageRecord['diff'] | undefined;
  if (input.previousRecordIds && input.currentRecordIds) {
    const prev = new Set(input.previousRecordIds.map(String));
    const curr = new Set(input.currentRecordIds.map(String));
    let added = 0;
    let removed = 0;
    let unchanged = 0;
    for (const id of curr) {
      if (prev.has(id)) unchanged++;
      else added++;
    }
    for (const id of prev) {
      if (!curr.has(id)) removed++;
    }
    diff = { added, updated: 0, removed, unchanged };
  }

  const record: LineageRecord = {
    id,
    layerId: input.layerId,
    source: input.source,
    sourceUrl: input.sourceUrl,
    responseStatus: input.responseStatus,
    fetchStartMs: input.fetchStartMs,
    fetchEndMs: input.fetchEndMs,
    latencyMs: input.fetchEndMs - input.fetchStartMs,
    responseSizeBytes: input.responseSizeBytes,
    recordsReturned: input.recordsReturned,
    recordsAccepted: input.recordsAccepted,
    qualityFilters: input.qualityFilters ?? [],
    diff,
    sourceType: input.sourceType ?? 'primary',
    error: input.error,
  };

  lineageRecords.set(id, record);

  // Cap at MAX_RECORDS per layer — keep newest
  const byLayer = getLineageByLayer(input.layerId);
  if (byLayer.length > MAX_RECORDS) {
    const toRemove = byLayer.slice(0, byLayer.length - MAX_RECORDS);
    for (const r of toRemove) lineageRecords.delete(r.id);
  }

  return record;
}

export function getLineage(id: string): LineageRecord | undefined {
  return lineageRecords.get(id);
}

export function getLineageByLayer(layerId: string): LineageRecord[] {
  return Array.from(lineageRecords.values())
    .filter((r) => r.layerId === layerId)
    .sort((a, b) => a.fetchStartMs - b.fetchStartMs);
}

export function getAllLineage(): LineageRecord[] {
  return Array.from(lineageRecords.values()).sort((a, b) => b.fetchStartMs - a.fetchStartMs);
}

// ---------------------------------------------------------------------------
// Audit log recording
// ---------------------------------------------------------------------------

export interface RecordAuditInput {
  countryCode: string;
  ruleVersion: string;
  inputLineageIds: string[];
  score: number;
  previousScore: number | null;
  components: AuditLogEntry['components'];
  confidence: AuditLogEntry['confidence'];
  appliedRules: string[];
  gaps: string[];
}

export function recordAudit(input: RecordAuditInput): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: `au-${Date.now()}-${++auditIdCounter}`,
    countryCode: input.countryCode,
    computedAtMs: Date.now(),
    ruleVersion: input.ruleVersion,
    inputLineageIds: input.inputLineageIds,
    score: input.score,
    previousScore: input.previousScore,
    components: input.components,
    confidence: input.confidence,
    appliedRules: input.appliedRules,
    gaps: input.gaps,
  };

  auditEntries.push(entry);
  // Cap at MAX_RECORDS × number of countries (~8600)
  if (auditEntries.length > 8600) {
    auditEntries.splice(0, auditEntries.length - 8600);
  }

  return entry;
}

export function getAuditTrail(countryCode: string): AuditLogEntry[] {
  return auditEntries.filter((a) => a.countryCode === countryCode).sort((a, b) => a.computedAtMs - b.computedAtMs);
}

export function getLatestAudit(countryCode: string): AuditLogEntry | undefined {
  const trail = getAuditTrail(countryCode);
  return trail[trail.length - 1];
}

export function getAllAudits(): AuditLogEntry[] {
  return [...auditEntries].sort((a, b) => b.computedAtMs - a.computedAtMs);
}

// ---------------------------------------------------------------------------
// Summary statistics for the audit viewer
// ---------------------------------------------------------------------------

export interface LineageSummary {
  totalFetches: number;
  avgLatencyMs: number;
  successRate: number;
  totalQualityRejections: number;
  qualityRejectionBreakdown: Record<string, number>;
  layerCoverage: string[];
}

export function summarizeLineage(): LineageSummary {
  const all = getAllLineage();
  const totalFetches = all.length;
  const successes = all.filter((r) => r.responseStatus >= 200 && r.responseStatus < 300 && !r.error);
  const avgLatencyMs =
    successes.length > 0 ? Math.round(successes.reduce((s, r) => s + r.latencyMs, 0) / successes.length) : 0;
  const successRate = totalFetches > 0 ? successes.length / totalFetches : 1;

  const qualityRejectionBreakdown: Record<string, number> = {};
  let totalQualityRejections = 0;
  for (const r of all) {
    for (const f of r.qualityFilters) {
      qualityRejectionBreakdown[f.rule] = (qualityRejectionBreakdown[f.rule] ?? 0) + f.rejectedCount;
      totalQualityRejections += f.rejectedCount;
    }
  }

  const layerCoverage = Array.from(new Set(all.map((r) => r.layerId))).sort();

  return {
    totalFetches,
    avgLatencyMs,
    successRate,
    totalQualityRejections,
    qualityRejectionBreakdown,
    layerCoverage,
  };
}
