# Production setup checklist

Follow the Cloudflare and Firebase setup in the repository [README](../README.md). Before announcing PawBangla publicly, verify these behaviors in the deployed hostname:

1. Firebase Google sign-in and email/password sign-in both establish a secure session; unverified email/password accounts are blocked.
2. Email password reset works, and Firebase lists the actual Cloudflare hostname as authorized.
3. Member profile creation works. Adoption stays locked until 12 hours after profile creation and the in-person identity check remains required.
4. Community photos stay private while pending and appear only after approval. Pet SOS publishes immediately, and its limits are visible to reporters.
5. Only the owner (`ifteeraiyan123@gmail.com`) and configured backup reviewer (`iftunotsame@gmail.com`) can access reviewer tools.
6. Adoption contact details remain private until the in-person identity check has been approved.
7. D1 migrations are applied to the intended database and test photos can upload to the private Supabase Storage bucket and be deleted.
8. Resend's sending domain and `PAWBANGLA_RESEND_API_KEY` are configured securely before anyone relies on SOS or reviewer email delivery. Test subscribe, delivery, unsubscribe and retry end to end.
9. Clinic/shop directory entries have accurate division, address, contact, source, service type, last-checked date and verification status. Keep map leads distinct from phone-checked and field-verified providers.
10. Privacy, terms, reviewer operations, reports, account deletion and mobile layouts are checked on the live Cloudflare URL.

## Transfer and ownership

The Cloudflare account, Workers project, domain, D1 database, Supabase project and mail account should all be owned or administered by `ifteeraiyan123@gmail.com`. Cloudflare Worker deployment does not automatically copy existing D1 records or Supabase Storage objects from a different host. Export, restore and verify existing production data before switching the public domain.
