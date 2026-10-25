"use client";

// Friction (STORE_FRICTION=1 only): a promo pop-up that covers the page, and
// with it the Add to cart button, until it's closed. The only close control is
// a "×" with no accessible name. It shows once per browser session (a cookie),
// like a typical newsletter modal. The default store has no pop-up.

import { useEffect, useState } from "react";

const SEEN_COOKIE = "promo_seen";

export function PromoModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!document.cookie.split("; ").some((c) => c.startsWith(`${SEEN_COOKIE}=`))) setOpen(true);
  }, []);

  if (!open) return null;

  const close = () => {
    document.cookie = `${SEEN_COOKIE}=1; path=/`;
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-80 space-y-3 rounded-lg bg-white p-6 shadow-lg">
        <button type="button" onClick={close} className="absolute right-3 top-2 text-xl text-zinc-500">
          ×
        </button>
        <p className="text-lg font-semibold">Get 10% off your first order</p>
        <p className="text-sm text-zinc-600">Join our list for early access to new arrivals.</p>
        <input type="email" placeholder="you@example.com" className="w-full rounded border border-zinc-300 px-3 py-2" />
        <button type="button" onClick={close} className="w-full rounded bg-zinc-900 px-4 py-2 text-white">
          Sign me up
        </button>
      </div>
    </div>
  );
}
