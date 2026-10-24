// Server-side cart store. Carts are keyed by the `cart_id` cookie, so every
// agent run in a fresh browser context gets its own cart. Held in memory on
// globalThis so dev-server hot reloads keep the state.

import type { CartItem } from "@agentfix/shared";

export const CART_COOKIE = "cart_id";

const store: Map<string, CartItem[]> = ((globalThis as { __agentfixCarts?: Map<string, CartItem[]> })
  .__agentfixCarts ??= new Map());

export function getCart(cartId: string | undefined): CartItem[] {
  return (cartId && store.get(cartId)) || [];
}

export function addToCart(cartId: string, sku: string, quantity = 1): CartItem[] {
  const items = [...getCart(cartId)];
  const existing = items.find((i) => i.sku === sku);
  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({ sku, quantity });
  }
  store.set(cartId, items);
  return items;
}
