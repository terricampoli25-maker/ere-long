# Ere Long — Deployment & Fulfillment Setup

The app deploys as a Cloudflare Worker (`ere-long`) that gates every file
behind a serial unlock. Serials are issued by the existing
**serial-activation** license service (the one built in
`Desktop App\Inflictor-Desktop\worker\`). This checklist wires the two
together plus Stripe. Steps marked 🔑 need your accounts.

## A. License service (one-time, if not already live)

1. 🔑 Confirm the serial-activation worker is deployed and note its URL
   (e.g. `https://serial-activation.<your-subdomain>.workers.dev`).
   If it was never deployed, follow the checklist inside
   `Desktop App\Inflictor-Desktop\wrangler (2).toml`.
2. 🔑 Add Ere Long to its products table:
   ```
   wrangler d1 execute serial-activation-db --remote --command "INSERT INTO products (code, name, is_subscription, is_active) VALUES ('ERELONG', 'Ere Long', 0, 1);"
   ```
   (Check the schema first — column names may differ slightly; there may
   also be a `max_activations` default on serials, which is 2.)

## B. Ere Long worker

1. Edit `wrangler.jsonc`: replace `LICENSE_API` with the real license
   service URL. `PRODUCT_CODE` must equal the `code` used in step A2.
2. 🔑 Set the session secret (any long random string):
   ```
   NODE_OPTIONS="--use-system-ca" npx wrangler secret put SESSION_SECRET
   ```
3. Deploy from this folder:
   ```
   NODE_OPTIONS="--use-system-ca" npx wrangler deploy
   ```
4. Visit the deployed URL: you should be REDIRECTED to the unlock page.
   Every direct file URL (e.g. `/app.js`, `/sounds/storm.mp3`) should
   return 403 until unlocked.

## C. Stripe — YEARLY SUBSCRIPTION (decided 2026-07-09)

⚠️ The old `fZu5kE…` link is a $6 ONE-TIME payment — wrong type now.
Do NOT reuse it; create a fresh link and retire the old one from the
registry.

1. 🔑 In Stripe: create a recurring price for Ere Long — **$6.00 / year**
   — and a new Payment Link from it. Add metadata
   `product_code = ERELONG` to the link (this is what the webhook uses
   to issue the right serial).
   ⚠️ REGISTRY RULE: open the new link yourself and read "Ere Long" and
   "per year" on the checkout page before wiring anything. Then add it
   to the payment-link registry.
2. 🔑 Confirm the Stripe webhook endpoint points at the license service
   (`https://serial-activation.terricampoli25.workers.dev/webhook/stripe`)
   and sends `checkout.session.completed` and
   `customer.subscription.deleted` (cancellation revokes the serial
   automatically — that's the whole point of yearly).
3. Set the Payment Link's after-payment message to something like:
   "Your serial number is on its way to your email. Open
   <app URL> and enter it to unlock Ere Long."

How enforcement works: sessions last 30 days; the unlock page silently
re-validates the remembered serial, and the license service refuses
serials whose subscription was cancelled. So a canceller keeps access
for at most ~30 days past cancellation, automatically — no manual
deactivation ever.

## D. End-to-end rehearsal (before re-enabling the card button)

1. 🔑 Buy through the real link yourself.
2. Confirm the serial email arrives and reads "Ere Long".
3. Enter the serial on the unlock page → app opens.
4. Refresh, close, reopen — no re-prompt (cookie lasts 1 year).
5. Try the same serial in a third browser/device — it should refuse
   (2-device limit).
6. Only then: restore the buy button on the landing-page card.

## Notes

- The buyer's countdown data never touches any server; only the serial +
  a random device id are checked at unlock. The in-app copy says exactly
  this — keep it true.
- The app lives in `public/` (the deployed assets); `worker.js`,
  `wrangler.jsonc`, and this file stay at the root and are never served.
- Local dev: `npx wrangler dev` serves the gate + app together. The plain
  `python -m http.server` trick no longer shows the gate (it serves files
  directly) — fine for UI work, not for testing the lock.
