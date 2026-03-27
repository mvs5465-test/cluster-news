import { NextRequest, NextResponse } from "next/server";
import { tryAcquireRefreshAction } from "@/lib/actions";
import { refreshFeeds } from "@/lib/news";

export async function POST(request: NextRequest) {
  const lease = tryAcquireRefreshAction();
  if (!lease) {
    return NextResponse.json(
      { error: "Refresh is already running at the concurrency limit." },
      {
        status: 429,
        headers: {
          "Retry-After": "5",
        },
      },
    );
  }

  try {
    await refreshFeeds(true);
  } finally {
    lease.release();
  }

  const redirectTo = request.nextUrl.searchParams.get("redirect") || "/";
  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
}
