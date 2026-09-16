# Pactum

Pactum is a transferable reservation bond for fine dining: a restaurant creates a bond, a guest pays it directly in NIM, and the verified holder receives a reservation pass.

This repository currently contains the public product landing page and the mobile-first Nimiq Pay guest payment surface. Real provider calls are implemented. Independent server verification and the restaurant/staff surfaces remain release-blocking work.

## Local setup

```bash
npm install
npm run dev
```

Open `/` for the public site and `/p/ca-8f47-aurea` for the Mini App guest flow. Outside Nimiq Pay the app stays in read-only preview and clearly explains that wallet actions require Nimiq Pay.

## Security status

The app never requests keys or seed phrases. Client-reported payment success is not sufficient for production. See `docs/FEASIBILITY.md` for the exact unverified integration boundary.

## License

MIT
