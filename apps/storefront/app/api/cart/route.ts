import { NextResponse, type NextRequest } from "next/server";
import { CART_COOKIE, addToCart, getCart } from "@/lib/cart";
import { findVariant } from "@/lib/catalog";

// Backend cart state for the verifier. Reads the cart named by ?cartId=,
// falling back to the caller's cart cookie.
export async function GET(request: NextRequest) {
  const cartId =
    request.nextUrl.searchParams.get("cartId") ?? request.cookies.get(CART_COOKIE)?.value;
  return NextResponse.json({ cartId: cartId ?? null, items: getCart(cartId) });
}

// Add-to-cart form submission from a product page.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const sku = String(form.get("sku") ?? "");
  const slug = String(form.get("slug") ?? "");
  const match = findVariant(sku);

  if (!match || match.variant.stock === 0) {
    const back = slug ? `/products/${encodeURIComponent(slug)}?error=sold-out` : "/search";
    return NextResponse.redirect(new URL(back, request.url), 303);
  }

  const cartId = request.cookies.get(CART_COOKIE)?.value ?? crypto.randomUUID();
  addToCart(cartId, sku);

  const response = NextResponse.redirect(new URL("/cart", request.url), 303);
  response.cookies.set(CART_COOKIE, cartId, { path: "/", httpOnly: true, sameSite: "lax" });
  return response;
}
