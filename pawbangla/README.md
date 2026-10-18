# PawBangla

PawBangla is a Chattogram-first, all-pet welfare site for free adoption, clinic and shop discovery, care information, an approved-photo community, and urgent lost/found/injured Pet SOS reports. Adoption listings are free only: buying and selling are prohibited.

## Cloudflare release

This repository builds a Cloudflare Worker using Vinext and the Cloudflare Vite plugin. The Worker needs a D1 database named `pawbangla-db` bound as `DB`. Images use a private Supabase Storage bucket so you can skip Cloudflare R2 billing setup.

### Workers Builds commands

- Root directory: `/`
- Build command: `pnpm run build`
- Deploy command: `pnpm run deploy:cloudflare`
- Preview command: `pnpm run preview:cloudflare`
- Worker name: `pawbangla`

Add these **build variables** in Workers Builds before its first build. They are resource identifiers/names, not passwords:

| Build variable | Value |
| --- | --- |
| `PAWBANGLA_D1_DATABASE_ID` | UUID shown for your `pawbangla-db` database |
| `PAWBANGLA_D1_DATABASE_NAME` | `pawbangla-db` |

The build intentionally fails if the D1 UUID is missing in Workers Builds, to prevent publishing a Worker with a placeholder database binding. Add Supabase storage settings to the deployed Worker before testing image uploads.

### Runtime variables and secrets

In the Worker’s **Settings → Variables and Secrets**, add these runtime variables:

| Name | Value |
| --- | --- |
| `PAWBANGLA_FIREBASE_API_KEY` | Firebase web app API key (public Firebase config value) |
| `PAWBANGLA_FIREBASE_AUTH_DOMAIN` | Firebase web app auth domain |
| `PAWBANGLA_FIREBASE_PROJECT_ID` | Firebase project ID |
| `PAWBANGLA_FIREBASE_APP_ID` | Firebase web app ID |
| `PAWBANGLA_OWNER_EMAIL` | `ifteeraiyan123@gmail.com` |
| `PAWBANGLA_REVIEWER_EMAILS` | `ifteeraiyan123@gmail.com,iftunotsame@gmail.com` |
| `PAWBANGLA_SUPABASE_URL` | Supabase project URL, such as `https://<project-ref>.supabase.co` |
| `PAWBANGLA_SUPABASE_STORAGE_BUCKET` | `pawbangla-media` |
| `PAWBANGLA_FROM_EMAIL` | Verified sender address for alert/reviewer emails |

Add `PAWBANGLA_SUPABASE_SECRET_KEY` and `PAWBANGLA_RESEND_API_KEY` as **secrets**, not plain variables. Use Supabase's current secret API key (starts with `sb_secret_`), not its publishable key. Keep the Supabase bucket private. The Worker accesses it only after applying PawBangla authentication and moderation rules; never place the secret key in browser code or GitHub. Email alerts remain unavailable until Resend verifies the sending domain and delivery is tested. Do not commit Firebase config, Supabase keys, mail secrets, or Cloudflare credentials to GitHub. Firebase web config is public by design; the Worker verifies Firebase ID token signatures and does not trust a browser-supplied email.

### Firebase Authentication setup

1. Create a Firebase project and add a **Web app**.
2. In **Authentication → Sign-in method**, enable **Google** and **Email/Password**.
3. In **Authentication → Settings → Authorized domains**, add the exact Cloudflare hostname for the Worker, such as `pawbangla.<your-subdomain>.workers.dev`. Add your custom domain too after connecting it.
4. Copy the web app’s `apiKey`, `authDomain`, `projectId`, and `appId` into the Worker runtime variables above.
5. Open `/login.html`, test Google sign-in, create an email/password account, verify its email, sign out, and sign back in. Password reset is available on that page.

Firebase provides the Google and email/password authentication providers used by this site. PawBangla stores the verified Firebase user ID, email and private profile in Cloudflare D1; passwords remain with Firebase. A one-hour, Secure, HttpOnly, SameSite cookie is issued only after server-side signature, project, expiry and verified-email checks.

### Supabase image storage setup

1. Create a Supabase project on the Free plan. Current Free limits include 1 GB of file storage and 5 GB of egress. Free projects may pause after one week without activity; check the current pricing before launch.
2. In **Storage**, create a bucket named `pawbangla-media` and leave it **private**.
3. Copy the Supabase project URL and the current **secret API key** from the project's API settings.
4. Add the URL and bucket name as Worker runtime variables, and add the secret API key as a Worker secret.

Images go through PawBangla's Worker. Pending community photos stay accessible to reviewers only; approved photos are served through the public community image endpoint. Do not make this bucket public or loosen its policies.

### Initialize D1

Run this from your local project folder once before sending users to the Worker. Use the database UUID from Cloudflare’s D1 page. The first three lines make the generated Wrangler config point to your actual Cloudflare resources:

```bash
PAWBANGLA_D1_DATABASE_ID="<your-d1-uuid>" PAWBANGLA_D1_DATABASE_NAME="pawbangla-db" pnpm run build
pnpm exec wrangler login
pnpm exec wrangler d1 migrations list pawbangla-db --remote --config dist/server/wrangler.json
pnpm exec wrangler d1 migrations apply pawbangla-db --remote --config dist/server/wrangler.json
```

Review the migration list before applying. This initializes the new Cloudflare database; it does not copy records from another hosting provider. If PawBangla already has live records or photos in a different database or storage provider, export and migrate those before switching users to the new Worker. Firebase user IDs differ from the previous ChatGPT-hosted IDs, so retained user-owned posts and identity checks need an explicit owner-ID mapping during data migration.

## Identity, moderation and safety

- Every member creates a private PawBangla profile. Adoption posting unlocks 12 hours after profile creation and still requires the existing in-person identity check and human review.
- Members can submit community photos and urgent Pet SOS reports before the 12-hour adoption threshold. Community photos remain private until approval. Pet SOS reports publish immediately and are not held for an always-on reviewer.
- The reviewer dashboard is `/review.html`. The owner and backup reviewer must sign in with Firebase using the email addresses in the reviewer allowlist.
- SOS reports and email alerts cannot guarantee a clinic is open or that help is on its way. Email delivery must be verified separately.
- A directory entry marked as a map lead is not the same as a phone-checked or field-verified provider.
