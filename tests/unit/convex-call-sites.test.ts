import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard against Convex argument drift.
 *
 * `agent/lib/convex.ts` addresses Convex functions by string name
 * (`db.mutation("webhookEvents:recordIfNew", …)`) so the agent bundle does not
 * depend on generated types. That convenience costs compile-time checking:
 * Convex rejects any argument its validator does not declare, and the failure
 * only surfaces at runtime as an opaque "Server Error".
 *
 * That exact drift once broke inbound texting in production — the Linq webhook
 * arrived, `webhookEvents:recordIfNew` was called with an undeclared
 * `receivedAt`, the mutation threw, and Belle silently never replied.
 *
 * This test statically parses every `db.query(...)` / `db.mutation(...)` call
 * site and asserts (a) the function exists and (b) every argument it passes is
 * declared in that function's `args` validator.
 */

const ROOTS = ["agent", "lib", "app"];
const CONVEX_DIR = "convex";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "_generated" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Extract the brace-balanced body starting just after `startIndex`. */
function balanced(src: string, startIndex: number): string {
  let depth = 1;
  let i = startIndex;
  while (i < src.length && depth > 0) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") depth -= 1;
    i += 1;
  }
  return src.slice(startIndex, i - 1);
}

/** name -> declared arg keys, or null when the function takes no `args` block. */
function declaredArgs(): Map<string, Set<string> | null> {
  const decls = new Map<string, Set<string> | null>();
  for (const file of readdirSync(CONVEX_DIR)) {
    if (!file.endsWith(".ts") || file === "schema.ts") continue;
    const mod = file.replace(/\.ts$/, "");
    const src = readFileSync(join(CONVEX_DIR, file), "utf8");
    const fnRe = /export const (\w+)\s*=\s*(?:mutation|query|action|internalMutation|internalQuery)\(\{/g;
    let m: RegExpExecArray | null;
    while ((m = fnRe.exec(src))) {
      const rest = src.slice(m.index + m[0].length);
      const argsMatch = /^\s*args:\s*\{/.exec(rest) ?? /\bargs:\s*\{/.exec(rest.slice(0, 400));
      if (!argsMatch) {
        decls.set(`${mod}:${m[1]}`, null);
        continue;
      }
      const body = balanced(rest, argsMatch.index + argsMatch[0].length);
      // Top-level keys only: strip nested braces/parens before matching.
      let depth = 0;
      let flat = "";
      for (const ch of body) {
        if (ch === "{" || ch === "(" || ch === "[") depth += 1;
        else if (ch === "}" || ch === ")" || ch === "]") depth -= 1;
        else if (depth === 0) flat += ch;
        if (depth === 0 && (ch === "}" || ch === ")" || ch === "]")) flat += ",";
      }
      const keys = new Set([...flat.matchAll(/(\w+)\s*:/g)].map((k) => k[1]!));
      decls.set(`${mod}:${m[1]}`, keys);
    }
  }
  return decls;
}

interface CallSite {
  file: string;
  fn: string;
  args: string[];
  spread: boolean;
}

/**
 * Pull the top-level keys out of an object literal body.
 *
 * Splits on top-level commas rather than scanning with one regex: a regex that
 * consumes the delimiter silently skips the key *after* a shorthand property
 * (`{ actionId, bogusField: 1 }` reported only `actionId`), which made the
 * guard pass on drift it was written to catch.
 */
function topLevelKeys(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "{" || ch === "(" || ch === "[") depth += 1;
    else if (ch === "}" || ch === ")" || ch === "]") depth -= 1;

    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);

  return parts
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith("...")) return null; // spread: unverifiable
      // `key: value`, or shorthand `key`
      const match = /^(\w+)\s*(?::|$)/.exec(trimmed);
      return match ? match[1]! : null;
    })
    .filter((k): k is string => k !== null);
}

function callSites(): CallSite[] {
  const sites: CallSite[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");

      // Untyped generated-API form used by the Workflow files and shared libs:
      //   convex().mutation(anyApi.githubSync.syncRepositories, { … })
      // These bypass the string-name form below and were previously unchecked,
      // which is how Convex argument drift reached production twice.
      const anyApiRe = /\.(?:mutation|query|action)\(\s*anyApi\.(\w+)!?\.(\w+)!?\s*,\s*\{/g;
      let a: RegExpExecArray | null;
      while ((a = anyApiRe.exec(src))) {
        const body = balanced(src, a.index + a[0].length);
        sites.push({
          file,
          fn: `${a[1]}:${a[2]}`,
          args: topLevelKeys(body),
          spread: /\.\.\./.test(body),
        });
      }

      const re = /db\.(?:mutation|query)\(\s*"([\w]+:[\w]+)"\s*,\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const body = balanced(src, m.index + m[0].length);
        sites.push({ file, fn: m[1]!, args: topLevelKeys(body), spread: /\.\.\./.test(body) });
      }
    }
  }
  return sites;
}

describe("Convex call sites match their validators", () => {
  const decls = declaredArgs();
  const sites = callSites();

  it("finds call sites to check", () => {
    expect(sites.length).toBeGreaterThan(10);
  });

  it("every referenced Convex function exists", () => {
    const missing = sites
      .filter((s) => !decls.has(s.fn))
      .map((s) => `${s.fn} (called in ${s.file})`);
    expect(missing).toEqual([]);
  });

  it("passes no argument the validator does not declare", () => {
    const violations: string[] = [];
    for (const site of sites) {
      // A spread (`{ ...event, createdAt: … }`) hides its own keys from static
      // analysis, but any literal key written alongside it is still checkable —
      // and that is exactly how the `audit:record` drift slipped through.
      const declared = decls.get(site.fn);
      if (!declared) continue;
      const extra = site.args.filter((a) => !declared.has(a));
      if (extra.length > 0) {
        violations.push(`${site.fn} <- undeclared [${extra.join(", ")}] in ${site.file}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
