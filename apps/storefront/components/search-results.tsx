// Search-results cards. Droid may edit this file (DROID_ALLOWED_FILES).

import Link from "next/link";
import type { SearchResult } from "@/lib/search";

export function SearchResults({ results }: { results: SearchResult[] }) {
  if (results.length === 0) {
    return <p className="text-sm text-zinc-600">No products match your search.</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {results.map((r) => (
        <li key={r.slug} className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-base font-semibold">{r.name}</h2>
          <p className="mt-1 text-sm text-zinc-700">${r.priceUsd}</p>
          <dl className="mt-2 text-sm text-zinc-700">
            <div className="flex gap-1">
              <dt className="font-medium">Color:</dt>
              <dd>{r.color}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="font-medium">Category:</dt>
              <dd>{r.category}</dd>
            </div>
          </dl>
          <ul
            aria-label="Size availability"
            className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700"
          >
            {r.variants.map((variant) => (
              <li key={variant.sku}>
                Size {variant.size}:{" "}
                {variant.stock > 0
                  ? `In stock (${variant.stock} left)`
                  : "Sold out"}
              </li>
            ))}
          </ul>
          <Link
            href={`/products/${r.slug}`}
            className="mt-3 inline-block text-sm font-medium text-blue-700 underline"
          >
            View details
          </Link>
        </li>
      ))}
    </ul>
  );
}
