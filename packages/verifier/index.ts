// Backend cart-state verification. Success is decided by what the storefront
// server holds in the cart, never by the agent claiming it is done.
// PROTECTED (DROID_PROTECTED_PATHS): Factory Droid never edits this package.

import type { CartItem, VerifiedOutcome } from "@agentfix/shared";

export interface VerifyCartInput {
  /** Storefront base URL, e.g. http://localhost:3001 */
  url: string;
  /** Value of the run's `cart_id` cookie; undefined if the agent never added anything. */
  cartId: string | undefined;
  expectedSku: string;
  expectedQuantity?: number;
  agentClaimedDone: boolean;
}

export async function readCart(url: string, cartId: string | undefined): Promise<CartItem[]> {
  if (!cartId) return [];
  const endpoint = new URL("/api/cart", url);
  endpoint.searchParams.set("cartId", cartId);
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`GET ${endpoint} failed: ${res.status}`);
  const body = (await res.json()) as { items: CartItem[] };
  return body.items;
}

/** Passes only when the cart holds exactly the expected SKU at the expected quantity. */
export async function verifyCart({
  url,
  cartId,
  expectedSku,
  expectedQuantity = 1,
  agentClaimedDone,
}: VerifyCartInput): Promise<VerifiedOutcome> {
  const cart = await readCart(url, cartId);
  const [only] = cart;

  let reason: string | undefined;
  if (cart.length === 0) {
    reason = "Cart is empty";
  } else if (cart.length > 1) {
    reason = `Cart has ${cart.length} different items; expected only ${expectedSku}`;
  } else if (only?.sku !== expectedSku) {
    reason = `Cart has ${only?.sku}; expected ${expectedSku}`;
  } else if (only.quantity !== expectedQuantity) {
    reason = `Quantity is ${only.quantity}; expected ${expectedQuantity}`;
  }

  return { success: reason === undefined, agentClaimedDone, cart, reason };
}
