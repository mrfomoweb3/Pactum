# Verification record

This file records commands actually run. It must not be treated as a Nimiq Pay device-test record.

## 2026-09-16

| Command | Result |
|---|---|
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test` | Passed — 1 test |
| `npm run build` | Passed — Vite production bundle generated |
| `npm run worker:check` | Passed — Cloudflare Worker dry run |
| `npm run worker:deploy` | Passed — Worker version `4f4ae9dd-ef4d-4a4b-86ed-96bb08ef31a9` |
| Live `GET /api/v1/health` | Passed — D1 available, Nimiq mainnet RPC reachable |
| Live `GET /api/v1/p/ca-8f47-aurea` | Passed — correct amount and payout address |
| Existing Nimiq Pay HTLC transaction recovery | Passed — `be22cfc8…580ac` independently verified and bond marked `SECURED` |

Nimiq Pay device testing, a real small-value transaction, and independent backend transaction verification were not run in this environment. See `FEASIBILITY.md`.

## 2026-09-17

| Command | Result |
|---|---|
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test` | Passed — 9 tests |
| `npm run build` | Passed — Vite production bundle generated |
| `npm run worker:check` | Passed — Cloudflare Worker dry run |
| `npx wrangler d1 migrations apply pactum-db --remote --config worker/wrangler.jsonc` | Passed — `0005_lifecycle_and_transfer.sql` applied |
| `npm run worker:deploy` | Passed — lifecycle release `fce3bf3a-d39b-47c9-9eff-6616d6edd9e5`; refund-safety revision `8355bfaf-6b94-438b-9044-5262c6027d0b` |
| Live `GET /api/v1/health` | Passed — HTTP 200, D1 and Nimiq RPC available |
| Remote D1 schema inspection | Passed — transfer/refund tables and bond lifecycle columns exist |
| Live `HEAD /staff/scan` on Vercel | Passed — HTTP 200 with SPA fallback |

Automated checks cover the state-machine and server logic. The new transfer-signature, staff check-in/apply, and wallet-confirmed refund journeys still require a manual test inside Nimiq Pay with distinct controlled guest and restaurant wallets; they are not claimed as device-tested yet.
