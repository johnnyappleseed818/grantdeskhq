# GrantDeskHQ questionnaire email — approval preview

**Status:** Preview only. Not sent.

**Eligible recipients in the current opt-in CSV:** 0

**Subject:** Still rebuilding funder reports in Excel?

**From:** Eli Katz <eli.katz@grantdeskhq.com>

Hi {{first_name}},

Many nonprofit finance teams keep accurate records in QuickBooks or another accounting system and still rebuild each funder's report in Excel—mapping transactions to funder budget lines, chasing program updates, and copying the results into a separate template.

GrantDeskHQ is an AI-assisted workflow designed to turn an approved grant budget, accounting export, program update, and funder form into a source-linked report draft for professional review. It works around the accounting system you already use rather than replacing it.

Would you share how your team handles post-award grant reporting today? The short questionnaire is here:

https://docs.google.com/forms/d/e/1FAIpQLSddrmCFTno2tDYLKW2qCSUllnFxjxcjNMFFPtZJoOlPxQPSBQ/viewform

As a thank-you, questionnaire participants who later become new GrantDeskHQ customers can receive **10% off their first three monthly payments**.

Thank you,<br>
Eli Katz<br>
GrantDeskHQ<br>
https://grantdeskhq.com

Advertisement from GrantDeskHQ. You received this because you opted in to GrantDeskHQ research and product updates.<br>
1021 East Lincolnway, Cheyenne, Wyoming 82001<br>
[Unsubscribe]({{{RESEND_UNSUBSCRIBE_URL}}})

## Approval and send prerequisites

- Rotate the API key that was pasted into chat. Never commit a Resend key.
- The published responder URL above has been verified and is also linked from the GrantDeskHQ assessment page.
- Verify the sending domain and sender in Resend.
- Configure a monitored reply-to address.
- The supplied physical postal address is included.
- Use the GTM Broadcast utility with `{{{RESEND_UNSUBSCRIBE_URL}}}` so Resend creates and processes a working unsubscribe link for each opted-in contact.
- Add only people with an explicit consent source and date to the opt-in CSV.
- Obtain final approval for the exact email and eligible recipient count.

The send utility at `scripts/gtm/resend-opt-in-broadcast.mjs` defaults to preview mode, requires `consent_status=opted_in`, and refuses rows without consent evidence. It creates a draft by default; live sending requires three exact confirmations.
