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
