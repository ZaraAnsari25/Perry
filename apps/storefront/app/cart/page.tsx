import { cookies } from "next/headers";
import { CART_COOKIE, getCart } from "@/lib/cart";
import { findVariant } from "@/lib/catalog";

export default async function CartPage() {
  const cartId = (await cookies()).get(CART_COOKIE)?.value;
  const items = getCart(cartId);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Your cart</h1>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-600">Your cart is empty.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const match = findVariant(item.sku);
            return (
              <li key={item.sku} className="rounded border border-zinc-200 bg-white p-3 text-sm">
                {match ? `${match.product.name}, size ${match.variant.size}` : item.sku} · Qty{" "}
                {item.quantity} · SKU <code>{item.sku}</code>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
