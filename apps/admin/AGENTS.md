# Operations & Management Agent

The admin dashboard allows support staff to manage tenants and wallets.

## Access Control
* Authenticate all requests via Supabase Auth JWTs.
* Verify the administrator role before allowing manual credits or debits.
* Record the administrator's email in the audit log for every manual action.

## Management Tools
* Debounce global search by at least 300ms to reduce API load.
* Require a mandatory reason for every wallet freeze or reversal.
* Implement a two-step confirmation for wallet closures.
* Ensure the CSV export streams data to handle large transaction volumes without crashing the browser.

## Monitoring
* The summary dashboard refreshes every 5 minutes automatically.
* Display the webhook delivery logs and endpoint health statuses clearly.