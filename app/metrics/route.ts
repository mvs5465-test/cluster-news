import { NextResponse } from "next/server";
import { getMetricsPayload } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getMetricsPayload();
  return new NextResponse(payload.body, {
    headers: {
      "Content-Type": payload.contentType,
      "Cache-Control": "no-store",
    },
  });
}
