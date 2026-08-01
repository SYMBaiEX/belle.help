import { connectGitHubCredentials } from "@vercel/connect/eve";
import { defaultGitHubAuth, githubChannel } from "eve/channels/github";

import { isLinqConfigured, sendText } from "../../lib/linq/client";
import { db, recordAudit } from "../lib/convex";

/**
 * GitHub → Belle via the Vercel Connect managed GitHub App.
 *
 * Connect receives the App's webhooks, verifies them, and forwards them to
 * /eve/v1/github signed with Vercel OIDC (no webhook secret to hold).
 * Setup (one time, with owner credentials):
 *   vercel connect create github --triggers
 *   vercel connect detach github/belle --yes
 *   vercel connect attach github/belle --triggers --trigger-path /eve/v1/github --yes
 *
 * Dispatch policy:
 * - @mentions of Belle in issue/PR comments start a GitHub-thread session
 *   (the channel's default), so users can also talk to Belle on GitHub.
 * - PR lifecycle and CI events NEVER open GitHub conversations. They are
 *   recorded in Convex, the user is notified with a deterministic templated
 *   text over the direct Linq API (idempotent), and the conversation context
 *   is updated so the user's next reply ("review it", "yes") resolves against
 *   the right PR inside their existing Linq Eve session.
 * - Auto-review repositories additionally enqueue a scheduled action that the
 *   reconcile schedule dispatches into the Linq session as agent work.
 */

const CONNECTOR = process.env.VERCEL_CONNECT_GITHUB_UID ?? "github/belle";

interface WatchingRepo {
  _id: string;
  userId: string;
  fullName: string;
  notifyDrafts: boolean;
  notifyCiFailures: boolean;
  autoReview: boolean;
  authorFilters?: string[];
  branchFilters?: string[];
}

interface PrMeta {
  number: number;
  title: string;
  authorLogin: string;
  baseRef: string;
  headRef: string;
  headSha: string;
  draft: boolean;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}

function prMetaFromRaw(raw: Record<string, unknown>, pullRequestNumber: number, headSha: string | null): PrMeta {
  const pr = (raw.pull_request ?? {}) as Record<string, unknown>;
  const user = (pr.user ?? {}) as Record<string, unknown>;
  const base = (pr.base ?? {}) as Record<string, unknown>;
  const head = (pr.head ?? {}) as Record<string, unknown>;
  return {
    number: pullRequestNumber,
    title: typeof pr.title === "string" ? pr.title : `PR #${pullRequestNumber}`,
    authorLogin: typeof user.login === "string" ? user.login : "unknown",
    baseRef: typeof base.ref === "string" ? base.ref : "",
    headRef: typeof head.ref === "string" ? head.ref : "",
    headSha: headSha ?? (typeof head.sha === "string" ? head.sha : ""),
    draft: pr.draft === true,
    additions: typeof pr.additions === "number" ? pr.additions : undefined,
    deletions: typeof pr.deletions === "number" ? pr.deletions : undefined,
    changedFiles: typeof pr.changed_files === "number" ? pr.changed_files : undefined,
  };
}

async function dedupe(
  externalEventId: string,
  eventType: string,
): Promise<{ duplicate: boolean; id?: string }> {
  return (await db.mutation("webhookEvents:recordIfNew", {
    provider: "github",
    externalEventId,
    eventType,
    verified: true,
  })) as { duplicate: boolean; id?: string };
}

/** Mark a webhook event finished so retries treat it as a true duplicate. */
async function settle(eventId: string | undefined, error?: unknown): Promise<void> {
  if (!eventId) return;
  try {
    if (error) {
      await db.mutation("webhookEvents:markFailed", {
        id: eventId,
        errorSummary: String(error).slice(0, 300),
      });
    } else {
      await db.mutation("webhookEvents:markProcessed", { id: eventId });
    }
  } catch (settleError) {
    console.error("[github-channel] failed to settle webhook event", settleError);
  }
}

/** Deliver a templated notification text to the user's Linq conversation. */
async function notifyUser(userId: string, text: string, idempotencyKey: string): Promise<void> {
  const ctx = (await db.query("conversationContexts:getByUserId", { userId })) as {
    linqChatId: string;
  } | null;
  if (!ctx?.linqChatId) return; // no active text conversation yet

  const recorded = (await db.mutation("outboundMessages:recordIfNew", {
    userId,
    linqChatId: ctx.linqChatId,
    idempotencyKey,
    body: text,
  })) as { duplicate: boolean; id?: string };
  if (recorded.duplicate) return;

  if (!isLinqConfigured()) {
    console.warn("[github-channel] LINQ_API_KEY not set — notification recorded but not sent");
    return;
  }
  try {
    await sendText(ctx.linqChatId, text, { idempotencyKey });
    if (recorded.id) await db.mutation("outboundMessages:markSent", { id: recorded.id });
  } catch (error) {
    if (recorded.id) await db.mutation("outboundMessages:markFailed", { id: recorded.id });
    console.error("[github-channel] Linq send failed", error);
  }
}

function matchesFilters(repo: WatchingRepo, pr: PrMeta): boolean {
  if (pr.draft && !repo.notifyDrafts) return false;
  if (repo.authorFilters?.length && !repo.authorFilters.includes(pr.authorLogin)) return false;
  if (repo.branchFilters?.length && pr.baseRef && !repo.branchFilters.includes(pr.baseRef)) return false;
  return true;
}

export default githubChannel({
  botName: process.env.GITHUB_BOT_NAME ?? "belle-agent",
  credentials: connectGitHubCredentials(CONNECTOR),

  // Default @mention dispatch on comments, with actor-derived auth.
  onComment: (ctx) => ({ auth: defaultGitHubAuth(ctx) }),

  // These hooks are AWAITED by eve (GitHubInboundResultOrPromise). Do the
  // work inline and await it — a fire-and-forget promise here is killed when
  // the serverless invocation ends, which silently dropped a real PR
  // notification after the dedup row had already been written.
  onPullRequest: async (ctx, pr) => {
    const repoFullName = ctx.repository.fullName;
    // "reopened" counts: closing and reopening is the natural way to
    // re-trigger a notification, and a reopened PR is genuinely new work.
    if (
      pr.action === "opened" ||
      pr.action === "ready_for_review" ||
      pr.action === "reopened"
    ) {
      try {
        await handlePrEvent(
          repoFullName,
          ctx.delivery.id,
          pr.action,
          prMetaFromRaw(pr.raw, pr.pullRequestNumber, pr.headSha),
        );
      } catch (error) {
        console.error("[github-channel] onPullRequest failed", error);
      }
    }
    // Never open a GitHub-comment session for PR lifecycle events.
    return null;
  },

  onCheckSuite: async (ctx, suite) => {
    if (suite.action === "completed" && suite.pullRequests.length > 0) {
      try {
        await handleCheckSuite(
          ctx.repository.fullName,
          `check_suite:${suite.checkSuiteId}:${suite.conclusion ?? "unknown"}`,
          suite.conclusion,
          suite.headSha,
          suite.pullRequests[0]!,
        );
      } catch (error) {
        console.error("[github-channel] onCheckSuite failed", error);
      }
    }
    return null;
  },
});

async function handlePrEvent(
  repoFullName: string,
  deliveryId: string,
  action: string,
  pr: PrMeta,
): Promise<void> {
  const event = await dedupe(`pr:${repoFullName}:${pr.number}:${action}:${deliveryId}`, "pull_request");
  if (event.duplicate) return;

  const watchers = (await db.query("repositories:listWatchersByFullName", {
    fullName: repoFullName,
  })) as WatchingRepo[];

  for (const repo of watchers) {
    if (!matchesFilters(repo, pr)) continue;

    await db.mutation("pullRequests:upsert", {
      userId: repo.userId,
      repositoryId: repo._id,
      number: pr.number,
      title: pr.title,
      authorLogin: pr.authorLogin,
      state: pr.draft ? "draft" : "open",
      headSha: pr.headSha,
      baseRef: pr.baseRef,
      headRef: pr.headRef,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      url: `https://github.com/${repoFullName}/pull/${pr.number}`,
    });

    // Make "review it" resolve to this PR on the user's next reply.
    await db.mutation("conversationContexts:setActivePr", {
      userId: repo.userId,
      repositoryFullName: repoFullName,
      prNumber: pr.number,
      headSha: pr.headSha,
    });

    const stats =
      pr.changedFiles !== undefined
        ? `\n${pr.changedFiles} files changed\n+${pr.additions ?? 0} / −${pr.deletions ?? 0}`
        : "";
    await notifyUser(
      repo.userId,
      `New PR in ${repoFullName}\n#${pr.number} ${pr.title}\nOpened by ${pr.authorLogin}${stats}\n` +
        (repo.autoReview ? "Auto-review is on — I'm reviewing it now." : "Want me to review it?"),
      `notify:pr:${repo.userId}:${repoFullName}:${pr.number}:${action}`,
    );

    if (repo.autoReview) {
      await db.mutation("scheduledActions:enqueue", {
        userId: repo.userId,
        kind: "auto_review",
        repositoryFullName: repoFullName,
        prNumber: pr.number,
        headSha: pr.headSha,
        createdAt: Date.now(),
      });
    }

    await recordAudit({
      userId: repo.userId,
      actor: "system",
      action: "github.pr_event",
      repositoryFullName: repoFullName,
      prNumber: pr.number,
      detail: `pull_request.${action}`,
    });
  }

  await settle(event.id);
}

async function handleCheckSuite(
  repoFullName: string,
  eventKey: string,
  conclusion: string | null,
  headSha: string | null,
  prNumber: number,
): Promise<void> {
  if (conclusion !== "failure" && conclusion !== "success") return;
  const event = await dedupe(`${repoFullName}:${eventKey}`, "check_suite");
  if (event.duplicate) return;

  const watchers = (await db.query("repositories:listWatchersByFullName", {
    fullName: repoFullName,
  })) as WatchingRepo[];

  for (const repo of watchers) {
    if (conclusion === "failure" && !repo.notifyCiFailures) continue;
    if (conclusion === "success") {
      // Only notify success when Belle recently acted on this PR (avoid noise).
      const latest = (await db.query("pullRequests:getByRepoAndNumber", {
        repositoryId: repo._id,
        number: prNumber,
      })) as { eveSessionId?: string } | null;
      if (!latest?.eveSessionId) continue;
    }

    const shortSha = headSha ? ` (head ${headSha.slice(0, 7)})` : "";
    await notifyUser(
      repo.userId,
      conclusion === "failure"
        ? `CI failed for PR #${prNumber} in ${repoFullName}${shortSha}.\nReply "investigate" and I'll dig into the logs.`
        : `CI is green for PR #${prNumber} in ${repoFullName}${shortSha}.`,
      `notify:ci:${repo.userId}:${repoFullName}:${prNumber}:${eventKey}`,
    );
  }

  await settle(event.id);
}
