// Usage: node scripts/verify-cart.ts <cartId> [expectedSku]
// Checks a cart on the store with Perry's verifier (read-only) and prints VERIFIED or why not.

import { verifyCart } from "@agentfix/verifier";

const [cartId, expectedSku = "VEL-BLK-08"] = process.argv.slice(2);
if (!cartId) {
  console.error("Usage: npm run verify-cart -w @agentfix/agent-interface -- <cartId> [expectedSku]");
  process.exit(1);
}
const url = process.env.STORE_URL ?? "http://localhost:3001";

const result = await verifyCart({ url, cartId, expectedSku, agentClaimedDone: true });
const cart = result.cart.map((i) => `${i.sku} × ${i.quantity}`).join(", ") || "empty";
if (result.success) console.log(`VERIFIED: cart ${cartId} on ${url} holds exactly ${expectedSku} × 1.`);
else console.log(`NOT VERIFIED: ${result.reason ?? "the cart doesn't match"} (cart: ${cart})`);
process.exit(result.success ? 0 : 1);
