# PawBangla production setup still required

## Member accounts and ownership

- Members sign in through the current ChatGPT-hosted identity, then create a private PawBangla profile with their display name and Bangladesh division. Their sign-in email is private.
- The 12-hour adoption cooldown starts when the PawBangla profile is first created. Profile edits do not reset it. Community photo and Pet SOS submissions are available immediately after profile creation; adoption still requires the existing in-person identity check and human review.
- `PAWBANGLA_OWNER_EMAIL` designates the PawBangla application owner. It is currently set to `ifteeraiyan123@gmail.com`; `PAWBANGLA_REVIEWER_EMAILS` continues to authorize the primary and backup reviewers. The owner role is separate from ownership of the hosting provider account.
- The current ChatGPT Site hosting account itself is still owned by its existing ChatGPT account. Before production migration, create or transfer the Cloudflare/Vercel project, domain, database, object storage and billing into an account controlled by `ifteeraiyan123@gmail.com`. Preserve and verify D1 records and R2 photos before switching the domain.
- The current sign-in relies on identity headers provided by ChatGPT Sites. Password login or hosting outside Sites needs a real identity provider and server-side session verification; never trust an email supplied by a browser form. Cloudflare is the nearer migration target because the app uses Workers, D1 and R2 bindings.

## Reviewer email authorization versus delivery

- `PAWBANGLA_REVIEWER_EMAILS` is the reviewer access allowlist. It is currently configured for `ifteeraiyan123@gmail.com` and `iftunotsame@gmail.com`.
- `PAWBANGLA_RESEND_API_KEY` and `PAWBANGLA_FROM_EMAIL` send notices; these are not present in the current Site environment. Reviewer authentication can work while reviewer email delivery remains unavailable. Queued notices remain retryable after valid sender settings are added.
- Configure a verified sending domain and restricted provider key in the chosen host's secure environment before relying on reviewer or SOS email. Do not put these values in source, screenshots, or chat.

## Reviewer password sign-in

PawBangla currently uses the Sites-hosted ChatGPT sign-in and checks reviewer email addresses on the server. Sites does not expose a password credential flow for this public project. Do not collect ChatGPT passwords or add a shared password to the page or source code.

Before enabling reviewer email-and-password sign-in, choose a dedicated identity provider that supports verified email, password reset, rate limiting, and per-reviewer accounts. Keep authorization restricted to the configured reviewer allowlist. All-member passwords would require a separate product and account-lifecycle decision.

## Email alerts and reviewer notices

The application already queues SOS emails and reviewer notices through Resend, with unsubscribe links and retry paths. Production sending remains disabled until the sender is configured.

1. Use a domain PawBangla controls. Add and verify it in Resend by publishing the DNS records Resend supplies.
2. In the PawBangla Site's secure environment settings, add `PAWBANGLA_RESEND_API_KEY` as a secret and `PAWBANGLA_FROM_EMAIL` as the sender address on the verified domain (for example, `PawBangla Alerts <alerts@your-verified-domain>`).
3. Keep `PAWBANGLA_REVIEWER_EMAILS` set to the primary and backup reviewer addresses. Do not put keys in this repository, browser code, or chat.
4. Deploy after changing the environment settings. Confirm the SOS section reports email delivery as configured.
5. Run the full alert flow on a private staging copy with test-only subscribers and non-public test data: subscribe with consent, trigger a test alert, verify receipt and the unsubscribe link, unsubscribe, then verify another alert is not sent to that address. Never publish a fabricated emergency on the public site.
6. Check the reviewer queue, confirm a new submission sends a notice, and confirm the reviewer dashboard can retry a failed send. Test forced provider failures in a staging copy or with a temporary test key; do not replace production credentials with an invalid key.
7. Remove staging test reports and subscriptions after the check. If no private staging copy is available, do not create a fake public SOS report; arrange a staging copy before testing the alert path end to end.

Until this full flow succeeds, email alerts must be described as unavailable and must not be relied on for urgent help.
