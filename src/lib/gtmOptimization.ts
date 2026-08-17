import type { ConversionLearningRecord } from "./gtmConversion";

export type AcquisitionChannel = "DIRECT_NONPROFIT" | "PARTNER";

export interface AcquisitionOutcomeRecord extends ConversionLearningRecord {
  channel: AcquisitionChannel;
}

export interface AcquisitionRecommendationEvidence {
  channel: AcquisitionChannel;
  reviewedOutcomes: number;
  wins: number;
  losses: number;
  winRate: number;
  outcomeRecordIds: string[];
}

export interface AcquisitionRecommendation {
  type: "CHANNEL_REVIEW";
  recommendedChannel: AcquisitionChannel;
  comparisonChannel: AcquisitionChannel;
  confidence: "low" | "medium" | "high";
  evidence: [AcquisitionRecommendationEvidence, AcquisitionRecommendationEvidence];
  explanation: string;
  boundary: "HUMAN_REVIEW_REQUIRED_NO_AUTOMATION";
}

const MINIMUM_REVIEWED_OUTCOMES_PER_CHANNEL = 3;

/** Produces a review suggestion only from completed, human-reviewed wins and losses. */
export function recommendAcquisitionChannels(records: AcquisitionOutcomeRecord[]): AcquisitionRecommendation[] {
  const direct = summarizeChannel(records, "DIRECT_NONPROFIT");
  const partner = summarizeChannel(records, "PARTNER");
  if (direct.reviewedOutcomes < MINIMUM_REVIEWED_OUTCOMES_PER_CHANNEL || partner.reviewedOutcomes < MINIMUM_REVIEWED_OUTCOMES_PER_CHANNEL || direct.winRate === partner.winRate) return [];
  const winner = direct.winRate > partner.winRate ? direct : partner;
  const comparison = winner.channel === "DIRECT_NONPROFIT" ? partner : direct;
  const totalReviewedOutcomes = winner.reviewedOutcomes + comparison.reviewedOutcomes;
  const confidence = totalReviewedOutcomes >= 20 ? "high" : totalReviewedOutcomes >= 10 ? "medium" : "low";
  return [{
    type: "CHANNEL_REVIEW",
    recommendedChannel: winner.channel,
    comparisonChannel: comparison.channel,
    confidence,
    evidence: [winner, comparison],
    explanation: `${channelLabel(winner.channel)} has ${winner.wins} win${plural(winner.wins)} in ${winner.reviewedOutcomes} human-reviewed outcomes (${formatRate(winner.winRate)}), compared with ${comparison.wins} in ${comparison.reviewedOutcomes} (${formatRate(comparison.winRate)}) for ${channelLabel(comparison.channel)}. Review this observed difference before changing acquisition work.`,
    boundary: "HUMAN_REVIEW_REQUIRED_NO_AUTOMATION"
  }];
}

function summarizeChannel(records: AcquisitionOutcomeRecord[], channel: AcquisitionChannel): AcquisitionRecommendationEvidence {
  const reviewed = records.filter((record) => record.channel === channel && isRealReviewedOutcome(record));
  const wins = reviewed.filter((record) => record.outcome === "WON").length;
  return { channel, reviewedOutcomes: reviewed.length, wins, losses: reviewed.length - wins, winRate: reviewed.length ? wins / reviewed.length : 0, outcomeRecordIds: reviewed.map((record) => record.id) };
}

function isRealReviewedOutcome(record: AcquisitionOutcomeRecord) {
  return record.humanReview === "COMPLETED" && record.status === record.outcome && (record.outcome === "WON" || record.outcome === "LOST") && record.responseAction === "NO_AUTO_RESPONSE" && /^conversion_[a-z0-9_]+$/.test(record.id) && /^outreach_(direct|partner)_[a-z0-9_]+$/.test(record.outreachId) && Number.isFinite(Date.parse(record.updatedAt));
}

function channelLabel(channel: AcquisitionChannel) { return channel === "DIRECT_NONPROFIT" ? "Direct nonprofit" : "Partner"; }
function plural(value: number) { return value === 1 ? "" : "s"; }
function formatRate(value: number) { return `${Math.round(value * 100)}%`; }
