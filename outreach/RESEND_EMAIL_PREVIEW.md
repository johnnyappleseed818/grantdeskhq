# GrantDeskHQ questionnaire email — approval preview

**Status:** Preview only. Not sent.

**Eligible recipients in the current opt-in CSV:** 0

**Subject:** A 3-minute nonprofit grant-reporting questionnaire

Hi {{first_name}},

Nonprofit finance teams often spend significant time bringing award terms, GL data, program updates, and funder templates together for a single report.

We’re validating GrantDeskHQ, an AI-assisted workflow designed to reduce that manual work, flag missing support earlier, and prepare a source-backed draft for professional review.

Would you share how your team handles post-award reporting today? The questionnaire takes about three minutes:

{{QUESTIONNAIRE_URL}}

As a thank-you, questionnaire participants who later become new GrantDeskHQ customers can receive **10% off their first three monthly payments**.

Thank you,  
The GrantDeskHQ team  
https://grantdeskhq.com

You opted in via {{CONSENT_SOURCE}} on {{CONSENT_DATE}}.  
{{PHYSICAL_POSTAL_ADDRESS}}  
[Unsubscribe]({{UNSUBSCRIBE_URL}})

## Approval and send prerequisites

- Rotate the API key that was pasted into chat. Never commit a Resend key.
- Publish the Google Form and replace `{{QUESTIONNAIRE_URL}}` with its responder URL.
- Verify the sending domain and sender in Resend.
- Configure a monitored reply-to address.
- Add a valid physical postal address.
- Give every recipient a working HTTPS unsubscribe URL.
- Add only people with an explicit consent source and date to the opt-in CSV.
- Obtain final approval for the exact email and eligible recipient count.

The send utility at `scripts/resend-questionnaire-email.mjs` defaults to preview mode and refuses rows without consent evidence or an unsubscribe URL.
