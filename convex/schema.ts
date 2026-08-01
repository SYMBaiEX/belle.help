import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    defaultMergeMethod: v.optional(
      v.union(v.literal("merge"), v.literal("squash"), v.literal("rebase")),
    ),
    aiMode: v.union(v.literal("byok"), v.literal("managed")),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
    approvalStatus: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")),
    ),
    approvedAt: v.optional(v.number()),
    approvedBy: v.optional(v.string()),
    inviteCodeUsed: v.optional(v.string()),
  }),

  phoneIdentities: defineTable({
    userId: v.optional(v.id("users")),
    phoneHash: v.string(),
    phoneLast4: v.string(),
    protocol: v.optional(
      v.union(v.literal("imessage"), v.literal("rcs"), v.literal("sms")),
    ),
    linqChatId: v.optional(v.string()),
    createdAt: v.number(),
    verifiedAt: v.optional(v.number()),
  })
    .index("by_phoneHash", ["phoneHash"])
    .index("by_linqChatId", ["linqChatId"]),

  onboardingSessions: defineTable({
    tokenHash: v.string(),
    phoneIdentityId: v.id("phoneIdentities"),
    linqChatId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("used"),
      v.literal("expired"),
    ),
    createdAt: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_tokenHash", ["tokenHash"]),

  encryptedCredentials: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("openai_api_key")),
    ciphertext: v.string(),
    iv: v.string(),
    authTag: v.string(),
    keyVersion: v.number(),
    last4: v.string(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  githubInstallations: defineTable({
    userId: v.id("users"),
    installationId: v.number(),
    accountLogin: v.string(),
    accountType: v.union(v.literal("User"), v.literal("Organization")),
    status: v.union(v.literal("active"), v.literal("revoked")),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_installationId", ["installationId"]),

  repositories: defineTable({
    userId: v.id("users"),
    installationId: v.number(),
    owner: v.string(),
    name: v.string(),
    fullName: v.string(),
    defaultBranch: v.optional(v.string()),
    autonomyLevel: v.number(),
    watchEnabled: v.boolean(),
    watchExpiresAt: v.optional(v.number()),
    reviewPolicy: v.union(
      v.literal("internal_only"),
      v.literal("blocking_only"),
      v.literal("blocking_important"),
      v.literal("high_confidence"),
      v.literal("always_ask"),
    ),
    notifyDrafts: v.boolean(),
    notifyCiFailures: v.boolean(),
    autoReview: v.boolean(),
    securityReview: v.boolean(),
    branchFilters: v.optional(v.array(v.string())),
    authorFilters: v.optional(v.array(v.string())),
    labelFilters: v.optional(v.array(v.string())),
    quietHoursStart: v.optional(v.number()),
    quietHoursEnd: v.optional(v.number()),
    dailyDigest: v.boolean(),
    weeklyDigest: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_fullName", ["fullName"])
    .index("by_userId_fullName", ["userId", "fullName"]),

  pullRequests: defineTable({
    userId: v.id("users"),
    repositoryId: v.id("repositories"),
    number: v.number(),
    title: v.string(),
    authorLogin: v.string(),
    state: v.union(
      v.literal("open"),
      v.literal("closed"),
      v.literal("merged"),
      v.literal("draft"),
    ),
    headSha: v.string(),
    baseRef: v.string(),
    headRef: v.string(),
    additions: v.optional(v.number()),
    deletions: v.optional(v.number()),
    changedFiles: v.optional(v.number()),
    url: v.string(),
    eveSessionId: v.optional(v.string()),
    lastEventAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_repositoryId_number", ["repositoryId", "number"])
    .index("by_userId", ["userId"]),

  reviewRuns: defineTable({
    userId: v.id("users"),
    pullRequestId: v.id("pullRequests"),
    headSha: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    summary: v.optional(v.string()),
    blockingCount: v.number(),
    importantCount: v.number(),
    suggestionCount: v.number(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_pullRequestId", ["pullRequestId"])
    .index("by_userId", ["userId"]),

  reviewFindings: defineTable({
    userId: v.id("users"),
    reviewRunId: v.id("reviewRuns"),
    severity: v.union(
      v.literal("blocking"),
      v.literal("important"),
      v.literal("suggestion"),
    ),
    confidence: v.union(
      v.literal("high"),
      v.literal("medium"),
      v.literal("low"),
    ),
    file: v.string(),
    startLine: v.optional(v.number()),
    endLine: v.optional(v.number()),
    title: v.string(),
    explanation: v.string(),
    impact: v.optional(v.string()),
    evidence: v.optional(v.string()),
    suggestedResolution: v.optional(v.string()),
    blocksMerge: v.boolean(),
    publishedToGitHub: v.boolean(),
    dismissedAt: v.optional(v.number()),
  })
    .index("by_reviewRunId", ["reviewRunId"])
    .index("by_userId", ["userId"]),

  fixRuns: defineTable({
    userId: v.id("users"),
    pullRequestId: v.id("pullRequests"),
    approvalId: v.optional(v.id("approvalRequests")),
    headShaAtApproval: v.string(),
    scope: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("validated"),
      v.literal("pushed"),
      v.literal("failed"),
    ),
    validation: v.optional(
      v.object({
        typecheck: v.optional(
          v.union(v.literal("passed"), v.literal("failed"), v.literal("skipped")),
        ),
        tests: v.optional(
          v.union(v.literal("passed"), v.literal("failed"), v.literal("skipped")),
        ),
        build: v.optional(
          v.union(v.literal("passed"), v.literal("failed"), v.literal("skipped")),
        ),
      }),
    ),
    commitSha: v.optional(v.string()),
    diffSummary: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_pullRequestId", ["pullRequestId"])
    .index("by_userId", ["userId"]),

  approvalRequests: defineTable({
    userId: v.id("users"),
    action: v.string(),
    repositoryFullName: v.string(),
    prNumber: v.optional(v.number()),
    headSha: v.optional(v.string()),
    findingIds: v.optional(v.array(v.id("reviewFindings"))),
    params: v.optional(v.any()),
    prompt: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("expired"),
      v.literal("consumed"),
    ),
    channel: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    resolvedAt: v.optional(v.number()),
    userResponse: v.optional(v.string()),
    executionResult: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  webhookEvents: defineTable({
    provider: v.union(v.literal("linq"), v.literal("github")),
    externalEventId: v.string(),
    eventType: v.string(),
    deliveryId: v.optional(v.string()),
    verified: v.boolean(),
    receivedAt: v.number(),
    processingState: v.union(
      v.literal("received"),
      v.literal("processed"),
      v.literal("failed"),
      v.literal("duplicate"),
    ),
    attemptCount: v.number(),
    processedAt: v.optional(v.number()),
    userId: v.optional(v.id("users")),
    repositoryFullName: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    eveSessionId: v.optional(v.string()),
    errorSummary: v.optional(v.string()),
  }).index("by_provider_externalEventId", ["provider", "externalEventId"]),

  outboundMessages: defineTable({
    userId: v.optional(v.id("users")),
    linqChatId: v.string(),
    idempotencyKey: v.string(),
    body: v.string(),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
    traceId: v.optional(v.string()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_linqChatId", ["linqChatId"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  auditEvents: defineTable({
    userId: v.optional(v.id("users")),
    actor: v.union(v.literal("belle"), v.literal("user"), v.literal("system")),
    action: v.string(),
    repositoryFullName: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    detail: v.optional(v.string()),
    refs: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  memories: defineTable({
    userId: v.id("users"),
    scope: v.union(
      v.literal("user"),
      v.literal("repository"),
      v.literal("conversation"),
    ),
    repositoryFullName: v.optional(v.string()),
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_userId_scope", ["userId", "scope"]),

  usageEvents: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    amount: v.number(),
    unit: v.string(),
    meta: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  notificationPreferences: defineTable({
    userId: v.id("users"),
    quietHoursStart: v.optional(v.number()),
    quietHoursEnd: v.optional(v.number()),
    timeZone: v.optional(v.string()),
    digestHour: v.optional(v.number()),
    bundlingWindowSec: v.optional(v.number()),
    snoozedUntil: v.optional(v.number()),
    mode: v.union(
      v.literal("all"),
      v.literal("security_only"),
      v.literal("ci_failures_only"),
    ),
  }).index("by_userId", ["userId"]),

  conversationContexts: defineTable({
    userId: v.id("users"),
    linqChatId: v.string(),
    eveSessionId: v.optional(v.string()),
    activeRepositoryFullName: v.optional(v.string()),
    activePrNumber: v.optional(v.number()),
    activeHeadSha: v.optional(v.string()),
    pendingApprovalId: v.optional(v.id("approvalRequests")),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_linqChatId", ["linqChatId"]),

  scheduledActions: defineTable({
    userId: v.id("users"),
    kind: v.union(
      v.literal("auto_review"),
      v.literal("scheduled_merge"),
      v.literal("reminder"),
      v.literal("watch_expiry"),
    ),
    repositoryFullName: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    headSha: v.optional(v.string()),
    payload: v.optional(v.any()),
    runAfter: v.optional(v.number()),
    status: v.union(
      v.literal("queued"),
      v.literal("dispatched"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    createdAt: v.number(),
    dispatchedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_userId", ["userId"]),

  inviteCodes: defineTable({
    code: v.string(),
    createdBy: v.string(),
    note: v.optional(v.string()),
    maxUses: v.number(),
    usedCount: v.number(),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  adminUsers: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    mustChangePassword: v.boolean(),
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
    passwordChangedAt: v.optional(v.number()),
  }).index("by_email", ["email"]),

  shortLinks: defineTable({
    code: v.string(),
    target: v.string(),
    kind: v.union(
      v.literal("onboarding"),
      v.literal("github_connect"),
      v.literal("dashboard"),
    ),
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    usedAt: v.optional(v.number()),
    useCount: v.number(),
  }).index("by_code", ["code"]),

  accessRequests: defineTable({
    userId: v.optional(v.id("users")),
    phoneIdentityId: v.id("phoneIdentities"),
    phoneLast4: v.string(),
    linqChatId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
    ),
    firstMessageAt: v.number(),
    firstMessagePreview: v.optional(v.string()),
    lastNudgeAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
    approvedNotifiedAt: v.optional(v.number()),
    note: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_phoneIdentityId", ["phoneIdentityId"])
    .index("by_linqChatId", ["linqChatId"]),
});
