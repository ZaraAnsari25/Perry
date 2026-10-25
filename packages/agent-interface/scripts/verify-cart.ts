// Usage: node scripts/verify-cart.ts <cartId> [expectedSku] [--save --client "Claude Desktop"]
// Checks a cart on the store with Perry's verifier (read-only) and prints VERIFIED or why not.
// --save also writes data/results/outside-agent-<time>.json for the dashboard, with
// the commands the perry-shop session used (from data/results/mcp-sessions/<cartId>.json).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyCart } from "@agentfix/verifier";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv.splice(i, 2)[1] : undefined;
};
const client = flag("client");
const save = argv.includes("--save");
const [cartId, expectedSku = "VEL-BLK-08"] = argv.filter((a) => a !== "--save");
if (!cartId) {
  console.error('Usage: npm run verify-cart -w @agentfix/agent-interface -- <cartId> [expectedSku] [--save --client "Claude Desktop"]');
  process.exit(1);
}
const url = process.env.STORE_URL ?? "http://localhost:3001";

const result = await verifyCart({ url, cartId, expectedSku, agentClaimedDone: true });
const cart = result.cart.map((i) => `${i.sku} × ${i.quantity}`).join(", ") || "empty";
if (result.success) console.log(`VERIFIED: cart ${cartId} on ${url} holds exactly ${expectedSku} × 1.`);
else console.log(`NOT VERIFIED: ${result.reason ?? "the cart doesn't match"} (cart: ${cart})`);

if (save) {
  const results = join(dirname(fileURLToPath(import.meta.url)), "../../../data/results");
  const session = await readFile(join(results, "mcp-sessions", `${cartId}.json`), "utf8")
    .then((t) => JSON.parse(t) as { implementation?: string })
    .catch(() => undefined);
  const createdAt = new Date().toISOString();
  const file = join(results, `outside-agent-${createdAt.replace(/[:.]/g, "-")}.json`);
  await mkdir(results, { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      {
        provenance: "live",
        client: client ?? "an MCP client",
        cartId,
        storeUrl: url,
        expectedSku,
        success: result.success,
        reason: result.reason,
        cart: result.cart,
        implementation: session?.implementation,
        createdAt,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Saved ${file}`);
}
process.exit(result.success ? 0 : 1);
