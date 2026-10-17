# PawBangla first-launch promise

## What PawBangla provides

- Free pet rehoming posts, reviewed before publication. Buying, selling, breeder advertisements, prices, and payment requests are not allowed.
- Clinic and pet-shop discovery with visible source labels and direct map links.
- Educational pet-care information, a community for pet photos and stories, and Cat SOS reports for lost, found, or injured cats.
- Human review before adoption, community, and Cat SOS submissions appear publicly. Cat SOS alerts can appear on the site and, when email delivery is configured, be emailed to people who opted in.
- A Chattogram-first rollout, expanding to other Bangladesh divisions as local listings can be checked and maintained.

## What PawBangla cannot promise

- A directory or map result does not guarantee that a clinic or shop is open, reachable, available, qualified, or currently offering a listed service. Visitors should call before travelling.
- An approved report or email alert does not mean a responder has seen it, help is on the way, or an animal will be found or rescued. PawBangla is not an emergency dispatch service or a veterinary provider.
- Human review checks posts against PawBangla's rules. It cannot guarantee every statement is true or that a provider's information remains current.
- Care information is educational and does not replace advice from a veterinarian.
- Coverage may be incomplete, especially outside the locations where information has been checked and maintained.

## Alert email release checklist

1. Add a domain controlled by PawBangla to the email provider and publish its required SPF and DKIM DNS records. Wait for the provider to mark the sending domain verified.
2. Create a restricted sending-only API key for that domain. Add it to the Site's secure production environment as `PAWBANGLA_RESEND_API_KEY`; never put it in source, a repository, or chat.
3. Set `PAWBANGLA_FROM_EMAIL` in the same secure Site environment to an address at the verified domain, such as `alerts@<verified-domain>`.
4. Deploy after changing Site environment values so the running Worker receives the new revision.
5. With a test account, enable Cat SOS email alerts and confirm consent is required and the subscription is saved.
6. Submit a clearly marked test report, approve it in the reviewer queue, and confirm the opted-in test inbox receives the approved report. Confirm the reviewer queue reports the send result.
7. Use the email's unsubscribe link and confirm the address is removed. Also test the email client's one-click unsubscribe action; opening the confirmation page alone must not unsubscribe.
8. Temporarily use a controlled invalid sender or test-only provider failure to confirm the queue marks the attempt failed, exposes a reviewer retry action, and sends after the issue is corrected. Do not use a real subscriber for failure testing.
9. Confirm unsubscribed addresses receive no later Cat SOS messages. Remove test reports and test subscriptions before launch.

## Queue behavior

Approval creates recipient queue rows. If sender settings are missing, rows remain queued and no email is attempted. A failed provider request is recorded as failed and can be retried by an authorized reviewer. Each recipient gets a one-click unsubscribe token; the token is not exposed in public APIs. A Cat SOS email is a notification of a reviewed report and is not a promise that anyone will respond.
