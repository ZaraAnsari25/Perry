# apps/storefront

Owner: **Person A**. Person A (Zara), branch `feat/agent-benchmark`. Person B does not edit this directory. Demo storefront, seeded catalog and cart.

```bash
npm run dev -w @agentfix/storefront              # http://localhost:3001
PORT=3002 npm run dev -w @agentfix/storefront    # second copy, e.g. the patched site
```

## Files

| File | Droid | Purpose |
|---|---|---|
| `lib/catalog.ts` | Protected | Product truth: price, color, category, per-size SKU and stock |
| `lib/search.ts` | May edit | Search query module. Baseline returns only name and price |
| `components/search-results.tsx` | May edit | Search-result cards. Baseline shows only name and price |
| `lib/cart.ts` | | In-memory carts keyed by the `cart_id` cookie |
| `app/api/cart/route.ts` | | `POST` add-to-cart form; `GET /api/cart?cartId=` returns backend cart state for the verifier |

## Demo task

"Find a black running shoe under $120 in size 8 that is in stock, and add it to my cart." The only correct variant is `VEL-BLK-08` (Velocity Runner). Decoys: Tempo Lite (size 8 sold out), Cloud Glide (navy), Aero Pace (white), Summit Hiker (hiking boot), Stride Pro ($125). Search results don't reveal color, category or stock, so on the baseline the agent has to open product pages.
