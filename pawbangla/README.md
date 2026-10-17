# PawBangla

Chattogram-first animal welfare site with approved-only rehoming listings and source-checked clinic and shop leads.

## Adoption review

- `POST /api/adoptions` requires Sign in with ChatGPT, same-origin requests, completed caretaker consent, a valid WhatsApp number and a JPEG or PNG photo under 5 MB.
- The server blocks sale, breeder, price and payment language. It strips JPEG/PNG metadata, uses generated object keys and writes the photo to the private R2 bucket.
- New records start as `pending`. Public listing and image routes select approved records only.
- `/review.html` uses the `PAWBANGLA_REVIEWER_EMAILS` runtime secret to restrict queue access. Reviewers can approve and publish or reject and remove a submission and its photo.

## Hosting

`.openai/hosting.json` declares D1 as `DB` and R2 as `BUCKET`. The Drizzle schema is in `db/schema.ts`; generated SQL is in `drizzle/`. Sites applies hosted migrations during deployment. Local migrations use the commands in the Sites Vinext starter guide.

Google Maps links open focused live searches by service and Chattogram neighborhood. Provider cards link to provider-published sources and are labeled as source-checked leads, not PawBangla endorsements.
