"use client";

// Friction (STORE_FRICTION=1 only): a size picker built from styled divs, the
// way many real stores build theirs. No <select>, <label>, radio inputs or
// ARIA roles, so assistive tech and AI agents reading the accessibility tree
// see bare text. Sold-out sizes are shown only by a strike-through and the
// chosen size only by colour. The default store uses a labelled <select>.

import { useState } from "react";

export interface PickerVariant {
  size: number;
  sku: string;
  stock: number;
}

export function SizePicker({ variants }: { variants: PickerVariant[] }) {
  const [sku, setSku] = useState("");

  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name="sku" value={sku} />
      <div className="flex gap-2">
        {variants.map((v) => {
          const soldOut = v.stock === 0;
          const chosen = sku === v.sku;
          return (
            <div
              key={v.sku}
              onClick={() => !soldOut && setSku(v.sku)}
              className={
                "min-w-10 rounded border px-3 py-2 text-center " +
                (soldOut
                  ? "cursor-not-allowed border-zinc-200 text-zinc-300 line-through"
                  : chosen
                    ? "cursor-pointer border-zinc-900 bg-zinc-900 text-white"
                    : "cursor-pointer border-zinc-300")
              }
            >
              {v.size}
            </div>
          );
        })}
      </div>
    </div>
  );
}
