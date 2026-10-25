// In the online copy, the job endpoints (agents, Droid, stores) are switched off.

import { NextResponse } from "next/server";

import { READ_ONLY, READ_ONLY_REASON } from "@/lib/mode";

export function proxy() {
  if (READ_ONLY) return new NextResponse(`${READ_ONLY_REASON}\n`, { status: 403 });
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
