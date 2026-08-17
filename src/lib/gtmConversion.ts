import { classifyConversionReply, conversionObjections, resolveConversionLearningStatus, type ConversionLearningStatus, type ConversionOutcome, type ConversionReplyClassification, type ConversionSuppressionStatus } from "./gtmIntelligence.ts";

export interface ConversionLearningRecord {
  id: string;
  outreachId: string;
  replyText: string;
  classification: ConversionReplyClassification;
  objections: ReturnType<typeof conversionObjections>;
  suppressionStatus: ConversionSuppressionStatus;
  outcome: ConversionOutcome;
  status: ConversionLearningStatus;
  humanReview: "REQUIRED" | "COMPLETED";
  responseAction: "NO_AUTO_RESPONSE";
  reviewerId: string | null;
  reviewNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversionLearningInput {
  id: string;
  outreachId: string;
  replyText: string;
  suppressionStatus: ConversionSuppressionStatus;
  outcome?: ConversionOutcome;
  reviewerId?: string | null;
  reviewNotes?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Builds a private learning record. Classification remains a deterministic suggestion until a human completes review. */
export function buildConversionLearningRecord(input: ConversionLearningInput): ConversionLearningRecord {
  const replyText = input.replyText.trim();
  const reviewerId = input.reviewerId?.trim() || null;
  const humanReview = reviewerId ? "COMPLETED" : "REQUIRED";
  const classification = classifyConversionReply(replyText);
  // A caller cannot quietly turn an unreviewed reply into a win or loss.
  const outcome = humanReview === "COMPLETED" ? input.outcome || "OPEN" : "OPEN";
  return {
    id: input.id,
    outreachId: input.outreachId,
    replyText,
    classification,
    objections: conversionObjections(classification),
    suppressionStatus: input.suppressionStatus,
    outcome,
    status: resolveConversionLearningStatus({ suppressionStatus: input.suppressionStatus, classification, outcome, humanReviewed: humanReview === "COMPLETED" }),
    humanReview,
    responseAction: "NO_AUTO_RESPONSE",
    reviewerId,
    reviewNotes: (input.reviewNotes || "").trim(),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt || input.createdAt
  };
}

export function isConversionLearningRecord(value: unknown): value is ConversionLearningRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ConversionLearningRecord>;
  const classifications: ConversionReplyClassification[] = ["UNSUBSCRIBE", "SECURITY_CONCERN", "TOO_EXPENSIVE", "PROCUREMENT_CONCERN", "ALREADY_HAVE_SOLUTION", "TRIAL_INTEREST", "WRONG_PERSON", "OTHER"];
  const outcomes: ConversionOutcome[] = ["OPEN", "WON", "LOST", "UNKNOWN"];
  const suppressions: ConversionSuppressionStatus[] = ["CLEAR", "BLOCKED", "UNKNOWN"];
  return /^conversion_[a-z0-9_]+$/.test(String(record.id || ""))
    && /^outreach_(direct|partner)_[a-z0-9_]+$/.test(String(record.outreachId || ""))
    && typeof record.replyText === "string" && record.replyText.length > 0 && record.replyText.length <= 10_000
    && classifications.includes(record.classification as ConversionReplyClassification)
    && outcomes.includes(record.outcome as ConversionOutcome)
    && suppressions.includes(record.suppressionStatus as ConversionSuppressionStatus)
    && (record.humanReview === "REQUIRED" || record.humanReview === "COMPLETED")
    && record.responseAction === "NO_AUTO_RESPONSE"
    && typeof record.reviewNotes === "string" && record.reviewNotes.length <= 5_000
    && typeof record.createdAt === "string" && typeof record.updatedAt === "string";
}
