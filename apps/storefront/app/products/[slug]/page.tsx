import { notFound } from "next/navigation";
import { PromoModal } from "@/components/promo-modal";
import { SizePicker } from "@/components/size-picker";
import { getProduct } from "@/lib/catalog";

// STORE_FRICTION=1 swaps in realistic agent-unfriendly UI (an unlabelled div
// size picker and a blocking promo pop-up). Unset, the page is unchanged.
const friction = () => process.env.STORE_FRICTION === "1";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const product = getProduct(slug);
  if (!product) notFound();

  return (
    <article className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">{product.name}</h1>
      <p className="text-lg">${product.priceUsd}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-zinc-500">Color</dt>
        <dd className="capitalize">{product.color}</dd>
        <dt className="text-zinc-500">Category</dt>
        <dd className="capitalize">{product.category}</dd>
      </dl>
      <p className="text-sm text-zinc-700">{product.description}</p>

      <section aria-labelledby="sizes-heading" className="space-y-2">
        <h2 id="sizes-heading" className="text-sm font-medium">
          Size availability
        </h2>
        <ul className="text-sm">
          {product.variants.map((v) => (
            <li key={v.sku}>
              Size {v.size}: {v.stock > 0 ? "In stock" : "Sold out"}
            </li>
          ))}
        </ul>
      </section>

      {error === "sold-out" && (
        <p role="alert" className="text-sm text-red-700">
          That size is sold out.
        </p>
      )}

      <form action="/api/cart" method="post" className="flex items-end gap-2">
        <input type="hidden" name="slug" value={product.slug} />
        {friction() ? (
          <SizePicker variants={product.variants.map((v) => ({ size: v.size, sku: v.sku, stock: v.stock }))} />
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor="sku" className="text-sm font-medium">
              Size
            </label>
            <select id="sku" name="sku" required className="rounded border border-zinc-300 px-3 py-2">
              <option value="">Select a size</option>
              {product.variants.map((v) => (
                <option key={v.sku} value={v.sku} disabled={v.stock === 0}>
                  {v.size}
                  {v.stock === 0 ? " (sold out)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="rounded bg-zinc-900 px-4 py-2 text-white">
          Add to cart
        </button>
      </form>
      {friction() && <PromoModal />}
    </article>
  );
}
