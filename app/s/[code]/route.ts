import { NextRequest, NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

/**
 * Short-link redirector. Resolves `code` via `shortLinks:resolve` and
 * 307-redirects to the stored target. Never 500s and never echoes the
 * target on a miss — both failure and expiry fall through to the same
 * generic `/link-expired` page.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  try {
    const result = await fetchMutation(api.shortLinks.resolve, { code });
    if (!result) {
      return NextResponse.redirect(new URL("/link-expired", req.url), 307);
    }
    return NextResponse.redirect(new URL(result.target, req.url), 307);
  } catch {
    return NextResponse.redirect(new URL("/link-expired", req.url), 307);
  }
}
