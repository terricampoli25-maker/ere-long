# Ere Long — Hard Rules (non-negotiable, every session)

1. **Never declare anything "verified," "all green," or "good to go" unless it was
   POSITIVELY confirmed** — observed working, or read directly from the authoritative
   dashboard, database, or logs. "No visible failures" is NOT verification. When
   summarizing readiness, itemize every piece as VERIFIED or UNVERIFIED — no bundling.

2. **State the dollar cost before any step that spends Terri's money.** Failed test
   purchases cost her real card fees. Always prefer zero-cost verification: Stripe
   event resend, D1 database reads, `wrangler tail`, dashboard inspection.

3. **Payment links:** the registry in the landing-page project's memory is definitive.
   A link is only wired after (a) its slug is checked against the registry / git history
   for staleness, and (b) Terri has personally opened it and read the product name and
   billing period on the checkout page. If the same URL arrives twice, suspect a stale
   clipboard — have her paste into Notepad to check.

4. **If a user-reported check result seems to clear a blocker, confirm they looked at
   the right object** (e.g., WHICH webhook endpoint, WHICH price) before accepting it.

5. Deploy = `NODE_OPTIONS="--use-system-ca" npx wrangler@latest deploy` from this folder.
   App lives in `public/`; gate worker is `worker.js`; canonical URL
   https://ere-long.terristech.com. Fulfillment: Stripe webhook → serial-activation
   worker → serial email (Resend). See SETUP.md for the full wiring.
