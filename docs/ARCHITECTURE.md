# Architecture

Pactum is a Vite/React Mini App backed by a Cloudflare Worker and D1. Nimiq Pay injects the wallet provider; private keys never reach Pactum.

```text
Nimiq Pay -> React Mini App -> Cloudflare Worker -> D1
    |                              |
    +-- sign/send NIM              +-- Nimiq JSON-RPC verification
```

The client requests wallet accounts, readable signatures, and explicit NIM transactions. The Worker owns authorization, state transitions, nonce consumption, pass versioning, audit events, and independent payment/refund verification. D1 stores profiles, restaurant-scoped staff approvals, bonds, intents, short-lived passes, and append-only events.

Security boundaries: client success never marks a payment verified; every staff mutation checks the owning restaurant; transferred or terminal passes increment `pass_version`; refund permission is opt-in; public QR tokens are short-lived; public responses omit guest identity.
