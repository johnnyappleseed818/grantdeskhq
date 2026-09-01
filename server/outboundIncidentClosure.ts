import type { CanonicalGtmRecord } from "../src/lib/gtmCanonical.ts";

export interface IncidentClosureTombstoneEvidence {
  tombstoneId: string;
  organizationId: string;
  canonicalRecordId: string;
  reason: string;
  priorContactReference: string;
  permanent: boolean;
}

export interface IncidentClosureEvidence {
  candidate: CanonicalGtmRecord | null;
  tombstone: IncidentClosureTombstoneEvidence | null;
  providerConflict: boolean;
  activeCanonicalOutboundState: boolean;
}

export interface IncidentClosureEvaluation {
  satisfied: boolean;
  canonicalHistory: boolean;
  tombstoneMatches: boolean;
  providerConflictClear: boolean;
  absentFromOutboundStates: boolean;
}

const outboundStates = new Set(["READY_TO_SEND", "STAGED", "APPROVED_FOR_CAMPAIGN", "PENDING_HANDOFF", "RESERVED", "ENROLLING", "CLAIMED"]);

export function evaluateIncidentClosureEvidence(input: IncidentClosureEvidence): IncidentClosureEvaluation {
  const candidate = input.candidate;
  const canonicalHistory = Boolean(candidate
    && candidate.state === "ALREADY_CONTACTED"
    && candidate.priorContact
    && candidate.blockers.includes("ALREADY_CONTACTED")
    && candidate.email
    && candidate.organizationId);
  const tombstoneMatches = Boolean(canonicalHistory
    && input.tombstone
    && input.tombstone.permanent
    && input.tombstone.reason === "ALREADY_CONTACTED"
    && input.tombstone.organizationId === candidate!.organizationId
    && input.tombstone.canonicalRecordId === candidate!.id
    && input.tombstone.priorContactReference);
  const absentFromOutboundStates = Boolean(canonicalHistory
    && !input.activeCanonicalOutboundState
    && !outboundStates.has(String(candidate!.state || ""))
    && !outboundStates.has(String(candidate!.instantlyStatus || "").toUpperCase()));
  const providerConflictClear = !input.providerConflict;
  return { satisfied: canonicalHistory && tombstoneMatches && providerConflictClear && absentFromOutboundStates, canonicalHistory, tombstoneMatches, providerConflictClear, absentFromOutboundStates };
}

export function findHistoricalClosureCandidate(records: readonly CanonicalGtmRecord[]) {
  const matches = records.filter((record) => record.segment === "DIRECT"
    && record.state === "ALREADY_CONTACTED"
    && record.priorContact
    && record.blockers.includes("ALREADY_CONTACTED")
    && Boolean(record.email)
    && Boolean(record.organizationId));
  return matches.length === 1 ? matches[0] : null;
}
