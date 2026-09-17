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

**Decision: GO for payment initiation, hash capture, and independent verification.**

A real `0.01 NIM` payment was broadcast from Nimiq Pay and independently verified by the Cloudflare Worker through Nimiq mainnet JSON-RPC. Nimiq Pay routed the payment through an internal HTLC sender (`fromType: 2`); the selected wallet was present in the transaction's observed `relatedAddresses`. The verifier accepts that relationship while still requiring an exact recipient, amount, network, data reference, successful execution, confirmation, and intent time window.

- Transaction: `be22cfc8c813aa0d1271fbfc94d59db3fecdbaad56185aa35f5338c3658280ac`
- Amount: `1,000 luna` (`0.01 NIM`)
- Network ID: `24` (`MainAlbatross`)
- Data reference: `PACTUM:ca-8f47-aurea:v1` (on-chain hex encoding verified)
- Result: bond transitioned from `PAYMENT_PENDING` to `SECURED`
- Verification source: `https://rpc.nimiqwatch.com` (`getTransactionByHash`)
- Public RPC limit observed/documented: 20 tokens per 10 seconds, subject to change

An earlier retry also broadcast transaction `94cbd213fc2a40e9d92ff157e218ca07579853b3b5bc2e78cb3f9cd9b82577f5`. It remains unassigned; only the transaction listed above secured the bond. Future rehearsals must use **Check payment status** instead of initiating another payment after an uncertain result.

## Remaining follow-up

1. Record wallet approval-to-detection timing during the next clean-session rehearsal.
2. Complete the deterministic message-signing portion of the spike.
3. Use separate controlled guest and restaurant wallets for the next rehearsal.
