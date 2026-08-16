import type { EnrichmentTarget, ShadowAwardDraftInput } from "../lib/contactEnrichment";

export interface ShadowContactEnrichmentCandidate {
  id: string;
  target: EnrichmentTarget;
  award: ShadowAwardDraftInput & { sourceUrl: string };
}

export const firstTwoShadowContactEnrichmentCandidates: ShadowContactEnrichmentCandidate[] = [
  {
    id: "lccaa-justin-paige",
    target: {
      organization: "Lorain County Community Action Agency",
      organizationDomain: "lccaa.net",
      domainSourceUrl: "https://www.lccaa.net/board-and-staff/",
      person: {
        firstName: "Justin",
        lastName: "Paige",
        fullName: "Justin Paige",
        currentTitle: "Chief Financial Officer",
        titleSourceUrl: "https://www.lccaa.net/board-and-staff/",
        titleObservedAt: "2026-08-16"
      }
    },
    award: {
      firstName: "Justin",
      organization: "Lorain County Community Action Agency",
      awardAmount: "$9.18M",
      awardingAgency: "Administration for Children and Families",
      awardStartDate: "August 1, 2026",
      sourceUrl: "https://www.usaspending.gov/award/ASST_NON_05CH013668_075/"
    }
  },
  {
    id: "glcap-david-chimahusky",
    target: {
      organization: "Great Lakes Community Action Partnership",
      organizationDomain: "glcap.org",
      domainSourceUrl: "https://www.glcap.org/about/",
      person: {
        firstName: "David",
        lastName: "Chimahusky",
        fullName: "David Chimahusky",
        currentTitle: "Chief Financial Officer",
        titleSourceUrl: "https://www.glcap.org/about/",
        titleObservedAt: "2026-08-16"
      }
    },
    award: {
      firstName: "David",
      organization: "Great Lakes Community Action Partnership",
      awardAmount: "$6.89M",
      awardingAgency: "Administration for Children and Families",
      awardStartDate: "August 1, 2026",
      sourceUrl: "https://www.usaspending.gov/award/ASST_NON_05HP000694_075/"
    }
  }
];
