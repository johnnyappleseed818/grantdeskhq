export const feedbackCategories = ["PRODUCT_FEEDBACK", "FEATURE_REQUEST", "PROBLEM_BUG", "BILLING_ACCOUNT", "SALES", "PARTNERSHIP", "OTHER"] as const;
export type FeedbackCategory = typeof feedbackCategories[number];
export const feedbackStatuses = ["NEW", "REVIEWED", "PLANNED", "RESOLVED", "CLOSED"] as const;
export type FeedbackStatus = typeof feedbackStatuses[number];
export interface FeedbackSubmission {
  id: string;
  createdAt: string;
  userId: string | null;
  name: string;
  email: string;
  organization: string;
  category: FeedbackCategory;
  message: string;
  sourcePage: string;
  status: FeedbackStatus;
  adminNotes: string;
  linkedCustomerId: string | null;
  notificationStatus: "SENT" | "NOT_CONFIGURED" | "FAILED";
}
export interface FeedbackInput { name?: unknown; email?: unknown; organization?: unknown; category?: unknown; message?: unknown; sourcePage?: unknown; website?: unknown; }
export function validateFeedbackInput(input: FeedbackInput | null | undefined) {
  const name = String(input?.name || "").trim(); const email = String(input?.email || "").trim().toLowerCase(); const organization = String(input?.organization || "").trim(); const category = String(input?.category || ""); const message = String(input?.message || "").trim(); const sourcePage = String(input?.sourcePage || "").trim(); const website = String(input?.website || "").trim(); const errors: string[] = [];
  if (!name || name.length > 120) errors.push("Enter your name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) errors.push("Enter a valid email address.");
  if (organization.length > 160) errors.push("Organization is too long.");
  if (!feedbackCategories.includes(category as FeedbackCategory)) errors.push("Choose a contact category.");
  if (!message || message.length > 5000) errors.push("Enter a message of 5,000 characters or fewer.");
  if (!/^\/(?:[a-z0-9_./-]*)$/i.test(sourcePage) || sourcePage.length > 240) errors.push("The source page is invalid.");
  return { errors, value: { name, email, organization, category: category as FeedbackCategory, message, sourcePage, website } };
}
