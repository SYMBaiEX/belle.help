#!/usr/bin/env node
/**
 * One-time seed for the first Belle admin operator account. Reads
 * ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD from the environment, hashes the
 * password with the same scrypt construction as lib/auth/admin.ts
 * (duplicated inline — this is a plain Node script, not a Next.js/TS
 * module, so it can't import from lib/ directly), and calls the Convex
 * `adminUsers:seedIfMissing` mutation.
 *
 * Never prints the password. Safe to re-run: no-ops if an admin with that
 * email already exists (see app/api/admin/seed/route.ts for the serverless
 * fallback that does the same thing over HTTP).
 *
 * Usage: npm run seed:admin
 */
import { randomBytes, scryptSync } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return { hash, salt };
}

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!email || !password) {
    console.error(
      "ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD must both be set in the environment.",
    );
    process.exitCode = 1;
    return;
  }
  if (!convexUrl) {
    console.error("NEXT_PUBLIC_CONVEX_URL must be set in the environment.");
    process.exitCode = 1;
    return;
  }

  const { hash, salt } = hashPassword(password);
  const client = new ConvexHttpClient(convexUrl);

  const result = await client.mutation(anyApi.adminUsers.seedIfMissing, {
    email,
    passwordHash: hash,
    passwordSalt: salt,
  });

  if (result.created) {
    console.log(`Created admin account for ${email}. They must change the password at first sign-in.`);
  } else {
    console.log(`Admin account for ${email} already exists — nothing to do.`);
  }
}

main().catch((err) => {
  console.error("Failed to seed admin account:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
