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

// Redirect on the host the browser used (localhost or a tunnel such as the
// Apify audit's). Next.js resolves request.url and relative Locations against
// its own internal host, so build the URL from the forwarded headers.
function redirectTo(request: NextRequest, path: string) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return new NextResponse(null, { status: 303, headers: { Location: `${proto}://${host}${path}` } });
}

// Add-to-cart form submission from a product page.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const sku = String(form.get("sku") ?? "");
  const slug = String(form.get("slug") ?? "");
  const match = findVariant(sku);

  if (!match || match.variant.stock === 0) {
    const back = slug ? `/products/${encodeURIComponent(slug)}?error=sold-out` : "/search";
    return redirectTo(request, back);
  }

  const cartId = request.cookies.get(CART_COOKIE)?.value ?? crypto.randomUUID();
  addToCart(cartId, sku);

  const response = redirectTo(request, "/cart");
  response.cookies.set(CART_COOKIE, cartId, { path: "/", httpOnly: true, sameSite: "lax" });
  return response;
}
