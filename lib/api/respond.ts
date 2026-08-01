import { NextResponse } from "next/server";

/** Consistent typed JSON error responses for app/api/** route handlers. */
export function apiError(status: number, message: string, code?: string) {
  return NextResponse.json({ error: { message, code } }, { status });
}

export function apiOk<T extends object>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}
