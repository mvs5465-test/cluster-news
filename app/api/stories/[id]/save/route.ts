import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { toggleSavedStory } from "@/lib/news";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  toggleSavedStory(Number(id));

  const redirectTo = request.nextUrl.searchParams.get("redirect") || "/";
  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath("/briefing");

  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
}
