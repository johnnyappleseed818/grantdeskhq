/**
 * GrantDeskHQ — Nonprofit Grant Reporting Workflow Assessment
 *
 * 1. Open https://script.google.com and create a new project.
 * 2. Paste this file, save, and run createGrantDeskHQSurvey().
 * 3. Approve permissions.
 * 4. Copy the URLs from the execution log.
 * 5. Review the form, click Publish, and set General access to "Anyone with the link".
 *
 * This script creates a form and a linked response spreadsheet. It does not
 * email anyone or add respondents to a mailing list automatically.
 */
function createGrantDeskHQSurvey() {
  const properties = PropertiesService.getScriptProperties();
  const existingFormId = properties.getProperty('GRANTDESKHQ_FORM_ID');
  const existingSheetId = properties.getProperty('GRANTDESKHQ_RESPONSE_SHEET_ID');

  if (existingFormId && existingSheetId) {
    const existingForm = FormApp.openById(existingFormId);
    const existingSheet = SpreadsheetApp.openById(existingSheetId);
    const existingUrls = {
      editUrl: existingForm.getEditUrl(),
      responderUrl: existingForm.getPublishedUrl(),
      responseSheetUrl: existingSheet.getUrl()
    };
    logSurveyUrls_(existingUrls);
    return existingUrls;
  }

  const form = FormApp.create('Nonprofit Grant Reporting Workflow Assessment');
  properties.setProperty('GRANTDESKHQ_FORM_ID', form.getId());

  form
    .setDescription(
      'A short questionnaire about how nonprofit finance teams prepare post-award funder reports. ' +
      'Your answers will help us understand where teams lose time, repeat manual work, and encounter missing information. ' +
      'GrantDeskHQ is an early-stage, AI-assisted reporting concept; this is product research, not a live accounting or compliance service.'
    )
    .setConfirmationMessage(
      'Thank you for sharing your experience. If you separately opted in to email, we may send the demo link, anonymized findings, and occasional product updates. ' +
      'Questionnaire participants who later become new monthly subscribers are eligible for 10% off their first three monthly payments.'
    )
    .setProgressBar(true)
    .setShuffleQuestions(false)
    .setLimitOneResponsePerUser(false)
    .setCollectEmail(true);

  form.addMultipleChoiceItem()
    .setTitle('1. Which role best describes your work?')
    .setChoiceValues([
      'CFO / Finance Director',
      'Controller / Grant Accountant',
      'Grants / Development',
      'Program / Impact',
      'Operations / COO',
      'Executive Director',
      'Other leadership'
    ]).setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('2. How many active grants does your organization or client portfolio manage?')
    .setChoiceValues(['1–4', '5–10', '11–25', '26–50', '51+'])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('3. How many post-award funder reports do you prepare in a typical quarter?')
    .setChoiceValues(['0–2', '3–5', '6–10', '11–20', '21+'])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('4. Approximately how much team time does one funder report require from start through final review?')
    .setChoiceValues(['Under 1 hour','1–3 hours','4–8 hours','9–15 hours','16+ hours','It varies widely'])
    .setRequired(true);

  const painValidation = FormApp.createCheckboxValidation()
    .requireSelectAtMost(3)
    .setHelpText('Please choose up to three.')
    .build();

  form.addCheckboxItem()
    .setTitle('5. Which parts of the process create the most work or risk? Choose up to three.')
    .setChoiceValues([
      'Decoding award and reporting rules',
      'Mapping GL transactions to funder categories',
      'Building budget-versus-actual tables',
      'Explaining financial variances',
      'Chasing program data and outcomes',
      'Finding receipts and supporting documents',
      'Reformatting information into funder templates',
      'Checking that numbers and narrative agree',
      'Deadlines, approvals, and final review'
    ]).setValidation(painValidation).setRequired(true);

  form.addCheckboxItem()
    .setTitle('6. Which tools or services support the current process? Select all that apply.')
    .setChoiceValues([
      'QuickBooks','Sage Intacct','NetSuite','Excel / Google Sheets','Word / Google Docs',
      'Instrumentl','Blackbaud / Foundant / Fluxx / Salesforce','Email and shared drives',
      'Outsourced accountant','Other grant software'
    ]).setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('7. Who is primarily responsible for the final report?')
    .setChoiceValues([
      'Finance','Grants / Development','Program team','Shared across several teams',
      'Outsourced accounting or consulting firm','No single owner is assigned'
    ]).setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle(
      '8. How useful would an AI-assisted workflow be if it could read the award and funder template, ' +
      'suggest GL mappings, draft the BVA and narrative, flag missing evidence, ' +
      'and link important figures and statements back to their source?'
    )
    .setChoiceValues([
      'Not useful','Slightly useful','Useful','Very useful','Extremely useful'
    ]).setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('9. Which next step would be most useful?')
    .setChoiceValues([
      '$500 Grant Reporting Workflow Assessment using completed, redacted historical work',
      'A short discovery call',
      'Show me the interactive demo first',
      'Interesting, but no current budget',
      'Not interested',
      'I am not the purchasing decision-maker'
    ]).setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('10. May GrantDeskHQ email you the interactive demo, anonymized findings, and occasional product updates?')
    .setHelpText('Choosing “Yes” is optional and is the only choice that provides email marketing consent. You can unsubscribe at any time.')
    .setChoiceValues([
      'Yes, I consent to receive these emails',
      'No, do not send me marketing emails'
    ]).setRequired(true);

  const responseSheet = SpreadsheetApp.create('GrantDeskHQ Workflow Assessment Responses');
  properties.setProperty('GRANTDESKHQ_RESPONSE_SHEET_ID', responseSheet.getId());
  form.setDestination(FormApp.DestinationType.SPREADSHEET, responseSheet.getId());
  form.setAcceptingResponses(true);

  const urls = {
    editUrl: form.getEditUrl(),
    responderUrl: form.getPublishedUrl(),
    responseSheetUrl: responseSheet.getUrl()
  };
  logSurveyUrls_(urls);
  return urls;
}

function logSurveyUrls_(urls) {
  Logger.log('FORM EDIT URL: ' + urls.editUrl);
  Logger.log('RESPONDER URL: ' + urls.responderUrl);
  Logger.log('RESPONSE SHEET URL: ' + urls.responseSheetUrl);
}

function doGet() {
  const urls = createGrantDeskHQSurvey();
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><base target="_top">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:Arial,sans-serif;max-width:720px;margin:48px auto;padding:0 24px;color:#17243b}' +
    'a{display:inline-block;margin:8px 12px 8px 0;padding:12px 18px;background:#176b57;color:#fff;text-decoration:none;border-radius:6px}' +
    'p{line-height:1.6}</style></head><body>' +
    '<h1>GrantDeskHQ questionnaire created</h1>' +
    '<p>The public questionnaire is accepting responses and its answers will be saved to the linked response sheet.</p>' +
    '<a href="' + urls.responderUrl + '">Review public questionnaire</a>' +
    '<a href="' + urls.editUrl + '">Edit questionnaire</a>' +
    '<a href="' + urls.responseSheetUrl + '">Open response sheet</a>' +
    '</body></html>'
  ).setTitle('GrantDeskHQ questionnaire');
}

// Backward-compatible alias for the function name in earlier versions of the kit.
function createGrantDeskSurvey() {
  return createGrantDeskHQSurvey();
}
