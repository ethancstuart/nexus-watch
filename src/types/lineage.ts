/**
 * Data Lineage Types
 *
 * Every data hop in NexusWatch is traceable. A fetch from a source
 * API produces a LineageRecord. An EvidenceDataPoint can reference
 * its LineageRecord by ID. An AuditLogEntry records the full context
 * of a CII computation.
 *
 * This is the "receipt" infrastructure that makes NexusWatch
 * genuinely auditable below the surface.
 */

/** A single hop from source → NexusWatch. */
export interface LineageRecord {
  /** Unique ID for this fetch cycle. */
  id: string;
  /** Layer that made the fetch. */
  layerId: string;
  /** Source system name. */
  source: string;
  /** Exact URL called (query params included). */
  sourceUrl: string;
  /** HTTP response status. */
  responseStatus: number;
  /** Timestamp of fetch initiation. */
  fetchStartMs: number;
  /** Timestamp of response received. */
  fetchEndMs: number;
  /** Latency in ms. */
  latencyMs: number;
  /** Byte size of the raw response. */
  responseSizeBytes: number;
  /** Count of data points returned. */
  recordsReturned: number;
  /** Count of data points accepted (after quality filters). */
  recordsAccepted: number;
  /** Quality filter stats. */
  qualityFilters: QualityFilterStat[];
  /** Diff vs previous fetch. */
  diff?: {
    added: number;
    updated: number;
    removed: number;
    unchanged: number;
  };
  /** Whether this was a primary or fallback source. */
  sourceType: 'primary' | 'fallback' | 'cache';
  /** Error message if fetch failed. */
  error?: string;
}

export interface QualityFilterStat {
  /** Human-readable filter rule. */
  rule: string;
  /** Count of records rejected by this rule. */
  rejectedCount: number;
}

/** An audit entry recording how a single CII score was computed. */
export interface AuditLogEntry {
  /** Unique ID. */
  id: string;
  /** Country this audit entry applies to. */
  countryCode: string;
  /** When this computation ran. */
  computedAtMs: number;
  /** CII rule version in effect. */
  ruleVersion: string;
  /** Input data lineage IDs (points to LineageRecord.id). */
  inputLineageIds: string[];
  /** Output score. */
  score: number;
  /** Previous score (for delta). */
  previousScore: number | null;
  /** Per-component scores. */
  components: {
    conflict: number;
    disasters: number;
    sentiment: number;
    infrastructure: number;
    governance: number;
    marketExposure: number;
  };
  /** Overall confidence. */
  confidence: 'high' | 'medium' | 'low';
  /** Summary of applied rules. */
  appliedRules: string[];
  /** Data gaps disclosed. */
  gaps: string[];
}

/** Per-sentence AI confidence tag. */
export interface ClaimConfidence {
  sentence: string;
  confidence: 'high' | 'medium' | 'low';
  /** Source IDs supporting the claim. */
  sourceIds: string[];
}

/** Audit entry for an AI analyst response. */
export interface AIAnalystAudit {
  id: string;
  query: string;
  computedAtMs: number;
  toolsUsed: string[];
  /** Per-sentence confidence breakdown. */
  claims: ClaimConfidence[];
  /** Overall response confidence (derived from claims). */
  overallConfidence: 'high' | 'medium' | 'low';
}
