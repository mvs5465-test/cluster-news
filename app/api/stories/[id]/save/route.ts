import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { tryAcquireSaveAction } from "@/lib/actions";
import { toggleSavedStory } from "@/lib/news";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const lease = tryAcquireSaveAction();
  if (!lease) {
    return NextResponse.json(
      { error: "Save actions are currently at capacity. Try again in a moment." },
      {
        status: 429,
        headers: {
          "Retry-After": "1",
        },
      },
    );
  }

  const { id } = await context.params;
  const storyId = Number(id);
  if (!Number.isInteger(storyId) || storyId <= 0) {
    lease.release();
    return NextResponse.json({ error: "Invalid story id." }, { status: 400 });
  }

  try {
    toggleSavedStory(storyId);
  } finally {
    lease.release();
  }

  const redirectTo = request.nextUrl.searchParams.get("redirect") || "/";
  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath("/briefing");

  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
}
