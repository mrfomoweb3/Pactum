# Pactum

Pactum is a transferable reservation bond for fine dining: a restaurant creates a bond, a guest pays it directly in NIM, and the verified holder receives a reservation pass.

The MVP includes restaurant and guest onboarding, bond creation, real NIM payment, independent verification, wallet-signed transfer, restaurant-scoped staff access, QR validation, check-in, apply-to-bill, refund, cancellation, forfeiture, and an audit timeline.

## Local setup

```bash
npm install
npm run dev
```

Open `/` for the public site and `/p/ca-8f47-aurea` for the Mini App guest flow. Outside Nimiq Pay the app stays in read-only preview and clearly explains that wallet actions require Nimiq Pay.

Copy `.env.example` to `.env.local` and set `VITE_NIMIQ_PAYOUT_ADDRESS` to the public Nimiq address that should receive the bond. Never add private keys or recovery words.

## Security status

The app never requests keys or seed phrases. Client-reported payment success is never sufficient: the Worker independently verifies payment before issuing a pass. See `docs/FEASIBILITY.md` and `docs/VERIFICATION.md` for evidence and the remaining device-test boundary.

## Cloudflare API

The Worker persists profiles, restaurant-scoped staff permissions, intents, passes, and audit events in D1. It independently verifies submitted hashes against Nimiq mainnet JSON-RPC before marking payment or refund complete.

Production API: `https://pactum-api.samuelsuccess234.workers.dev/api/v1`

Production app: `https://pactum-delta.vercel.app`

## Verification and rehearsal

Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and `npm run worker:check`. Apply remote migrations with `npx wrangler d1 migrations apply pactum-db --remote --config worker/wrangler.jsonc`. `worker/seed.sql` is explicitly rehearsal-only and must never be presented as a live transaction.

Pactum is not escrow. NIM goes directly to the restaurant. Refunds are separate restaurant-authorized payments back to the original payer.

## License

MIT
