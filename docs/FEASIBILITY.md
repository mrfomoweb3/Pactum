# Nimiq Pay feasibility spike

**Recorded:** 2026-09-16  
**Environment:** React 19 + Vite 7 local Mini App; Nimiq Pay device validation still required.

## Documentation reviewed

- https://www.nimiq.dev/mini-apps/tutorials/mini-app-tutorial
- https://www.nimiq.dev/mini-apps/api-reference/nimiq-provider

The current provider documentation confirms `init()`, `listAccounts()`, `sign()`, `sendBasicTransaction()`, and `sendBasicTransactionWithData()`. The data method accepts text and returns a transaction hash.

## Implemented spike path

The guest route calls `init()`, requests an account using `listAccounts()`, and submits the exact bond amount with `sendBasicTransactionWithData()` and `PACTUM:<publicId>:v1` as the transaction data. Wallet rejection restores the review state and does not issue a pass.

## Result

**Decision: PENDING DEVICE VALIDATION — not GO.**

No controlled Nimiq Pay wallet or payout address was available in this coding environment, so no real transaction was broadcast and no hash, explorer link, approval-to-detection time, or independent verification result is claimed. The frontend real-wallet call is present, but the app must not be described as payment-complete until a controlled-wallet test and server-side network verifier both pass.

## Required next run

1. Confirmed controlled payout address configured: `NQ77 8CXK 0PR4 7T9N LSBM L861 UVNU 2UKY D1U6`.
2. Open the local HTTPS URL inside Nimiq Pay.
3. Request the active account and sign a deterministic Pactum message.
4. Send a deliberately small NIM transaction with `PACTUM:SPIKE:v1`.
5. Capture the returned hash and verify recipient, exact luna value, sender, data, network, and confirmation independently.
6. Record timing, explorer link, verification source, and rate limits here; classify as `GO`, `PIVOT`, or `STOP`.
