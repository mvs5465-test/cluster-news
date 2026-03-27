import { NextRequest, NextResponse } from "next/server";
import { refreshFeeds } from "@/lib/news";

export async function POST(request: NextRequest) {
  await refreshFeeds(true);

  const redirectTo = request.nextUrl.searchParams.get("redirect") || "/";
  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
}
