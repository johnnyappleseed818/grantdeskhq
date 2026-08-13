# Northstar Interim Report 1 golden fixture

These files are synthetic GrantDeskHQ regression inputs. They are intentionally
test-only and contain no real grant, participant, or financial data.

The fixture is exercised as three core inputs plus nine independent supporting
evidence sources. Golden expectations belong in the regression snapshots and
tests, never in production analysis logic.

`manifest.json` pins the expected filenames, roles, byte sizes, and SHA-256
digests. Fixture-integrity tests fail before analysis if any input changes.
