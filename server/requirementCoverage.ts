import type { CompilationResult } from "../src/types/prototype.ts";

export interface RequirementCoverageEvaluation {
  score: number;
  passed: number;
  total: number;
  missing: string[];
}

export function evaluateComprehensiveRequirementCoverage(result: CompilationResult): RequirementCoverageEvaluation {
  const profile = Object.values(result.grantProfile).map((field) => `${field.value} ${field.source.excerpt}`).join(" ");
  const requirements = result.requirements.map((item) => `${item.requirement} ${item.source.excerpt}`).join(" ");
  const corpus = normalize(`${profile} ${requirements}`);
  const checks: Array<[string, RegExp]> = [
    ["Grant ID", /cpf-2026-0417/],
    ["Grant period", /october 1,? 2026.{0,100}september 30,? 2027|2026-10-01.{0,100}2027-09-30/],
    ["Restricted grant type", /restricted/],
    ["Quarter 1 deadline", /january 31,? 2027/],
    ["Quarter 2 deadline", /april 30,? 2027/],
    ["Quarter 3 deadline", /july 31,? 2027/],
    ["Quarter 4 deadline", /october 31,? 2027/],
    ["Final outcomes deadline", /november 30,? 2027/],
    ["Final financial deadline", /december 15,? 2027/],
    ["Required report components", /program narrative.{0,220}kpi.{0,220}budget.{0,80}actual|budget.{0,80}actual.{0,220}kpi.{0,220}program narrative/],
    ["Payment tied to report acceptance", /payment.{0,180}(accept|approval)|accept.{0,180}payment/],
    ["Allowable costs", /allowable.{0,200}(personnel|participant support|curriculum)/],
    ["Prohibited costs", /prohibit.{0,200}(alcohol|lobbying|fundraising)|(alcohol|lobbying|fundraising).{0,200}prohibit/],
    ["Reallocation prior approval", /(reallocation|budget category).{0,160}10\s*%.{0,160}prior written approval|prior written approval.{0,220}10\s*%/],
    ["Matching requirement", /60[ ,]?000.{0,160}(match|matching)|(match|matching).{0,160}60[ ,]?000/],
    ["Financial supporting documents", /(transaction schedule|payroll allocation).{0,220}(receipt|invoice)|(receipt|invoice).{0,220}(transaction schedule|payroll allocation)/],
    ["Program supporting documents", /(attendance|eligibility).{0,220}(kpi|source documentation)|(kpi|source documentation).{0,220}(attendance|eligibility)/],
    ["Enrollment KPI", /180.{0,100}(youth|enroll)|(youth|enroll).{0,100}180/],
    ["Workshop KPI", /24.{0,100}workshop|workshop.{0,100}24/],
    ["Paid work KPI", /120.{0,120}(paid work|work experience)|(paid work|work experience).{0,120}120/],
    ["Completion KPI", /85\s*%.{0,100}completion|completion.{0,100}85\s*%/],
    ["Placement KPI", /70\s*%.{0,160}(employment|education|placement)|(employment|education|placement).{0,160}70\s*%/],
    ["Narrative questions", /(?=[\s\S]*activities)(?=[\s\S]*(?:challenge|corrective action))/],
    ["Signed certification", /sign(ed|ature)?.{0,100}certification|certification.{0,100}sign(ed|ature)?/],
    ["Five-year retention", /five years.{0,120}(record|documentation)|(record|documentation).{0,120}five years/],
    ["Data and privacy requirement", /(participant information|identifier).{0,180}(minimum|disclosure)|(minimum|disclosure).{0,180}(participant information|identifier)/],
    ["Ten-business-day notice", /ten business days.{0,180}material|material.{0,180}ten business days/],
    ["Reporting recipient", /grants@communitypathways\.example|grants administration office/],
    ["Seven budget categories", /(?=[\s\S]*personnel)(?=[\s\S]*employee benefits)(?=[\s\S]*training)(?=[\s\S]*participant support)(?=[\s\S]*local travel)(?=[\s\S]*(?:data|evaluation))(?=[\s\S]*indirect)/]
  ];
  const missing = checks.filter(([, pattern]) => !pattern.test(corpus)).map(([label]) => label);
  const passed = checks.length - missing.length;
  return { score: Math.round((passed / checks.length) * 10_000) / 100, passed, total: checks.length, missing };
}

function normalize(value: string) {
  return value.toLowerCase().replaceAll("$", "").replace(/\s+/g, " ");
}
