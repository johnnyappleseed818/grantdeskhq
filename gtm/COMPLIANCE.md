# GTM channel boundaries

This is an implementation guardrail, not legal advice.

## Resend

Resend's current Acceptable Use Policy prohibits unsolicited messages, cold outreach, purchased lists, and scraped contact data. It requires explicit opt-in for mailing lists. Therefore:

- The 27 public nonprofit profiles are not eligible for Resend.
- Only rows with a valid email, `consent_status=opted_in`, consent source, consent date, and no unsubscribe flag can enter the Broadcast workflow.
- The script creates a dedicated segment and verifies its exact contact count before it creates a Broadcast.
- The Broadcast uses `{{{RESEND_UNSUBSCRIBE_URL}}}`, allowing Resend to manage unsubscribe preferences and suppress future Broadcasts.
- No campaign is sent without the exact eligible count, campaign ID, and `CONFIRM_RESEND_SEND=YES`.

Sources: [Resend Acceptable Use Policy](https://resend.com/legal/acceptable-use), [Resend Broadcasts](https://resend.com/docs/api-reference/broadcasts/create-broadcast), [Resend unsubscribe management](https://resend.com/docs/dashboard/audiences/managing-unsubscribe-list).

## Commercial email law

The FTC says CAN-SPAM applies to commercial email, including business-to-business messages. Requirements include accurate headers, non-deceptive subjects, clear identification of commercial content, a valid physical postal address, a working opt-out method, and prompt honoring of opt-outs.

The opt-in campaign includes those elements, but compliance with CAN-SPAM does not override Resend's stricter permission requirement. Rules outside the United States may be stricter.

Source: [FTC CAN-SPAM compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).

## LinkedIn

LinkedIn says third-party crawlers, bots, browser extensions, or other tools may not scrape the site or automate messages, comments, likes, shares, and similar activity. Therefore the engine stores public links and drafts only; a person reviews and posts manually.

Source: [LinkedIn prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions).

## Reddit

Reddit's Data API terms require approved access information and state that commercial use may require a separate agreement. The optional monitor refuses to run without an explicit commercial-access acknowledgment and OAuth credentials. It stores only post metadata needed for review and does not automate participation.

Sources: [Reddit Developer Terms](https://redditinc.com/policies/developer-terms), [Reddit Data API Terms](https://redditinc.com/policies/data-api-terms).

## Research-data rules

- Use official organization pages to verify current roles.
- Do not infer or generate email addresses.
- Keep “research fit” separate from proven need or buying intent.
- Reverify a role before any one-to-one contact.
- Record opt-out requests even if they arrive by reply.
- Never use Reddit or LinkedIn content to claim quantified market prevalence from this bounded scan.
