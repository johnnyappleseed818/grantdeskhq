# GrantDeskHQ questionnaire email — approval preview

**Status:** Preview only. Not sent.

**Eligible recipients in the current opt-in CSV:** 0

**Subject:** A 3-minute nonprofit grant-reporting questionnaire

**From:** Eli Katz <eli@grantdeskhq.com>

Hi {{first_name}},

Nonprofit finance teams often spend significant time bringing award terms, GL data, program updates, and funder templates together for a single report.

We’re validating GrantDeskHQ, an AI-assisted workflow designed to reduce that manual work, flag missing support earlier, and prepare a source-backed draft for professional review.

Would you share how your team handles post-award reporting today? The questionnaire takes about three minutes:

https://docs.google.com/forms/d/e/1FAIpQLSddrmCFTno2tDYLKW2qCSUllnFxjxcjNMFFPtZJoOlPxQPSBQ/viewform

As a thank-you, questionnaire participants who later become new GrantDeskHQ customers can receive **10% off their first three monthly payments**.

Thank you,<br>
Eli Katz<br>
GrantDeskHQ<br>
https://grantdeskhq.com

This is a commercial message from GrantDeskHQ.<br>
You opted in via {{CONSENT_SOURCE}} on {{CONSENT_DATE}}.<br>
1021 East Lincolnway, Cheyenne, Wyoming 82001<br>
[Unsubscribe]({{{RESEND_UNSUBSCRIBE_URL}}})

## Approval and send prerequisites

- Rotate the API key that was pasted into chat. Never commit a Resend key.
- The published responder URL above has been verified and is also linked from the GrantDeskHQ assessment page.
- Verify the sending domain and sender in Resend.
- Configure a monitored reply-to address.
- The supplied physical postal address is included.
- Use a Resend Broadcast with `{{{RESEND_UNSUBSCRIBE_URL}}}` so Resend creates and processes a working unsubscribe link for each opted-in contact.
- Add only people with an explicit consent source and date to the opt-in CSV.
- Obtain final approval for the exact email and eligible recipient count.

The send utility at `scripts/resend-questionnaire-email.mjs` defaults to preview mode and refuses rows without consent evidence or an unsubscribe URL.
