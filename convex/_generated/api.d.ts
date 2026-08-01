/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accessRequests from "../accessRequests.js";
import type * as accountDeletion from "../accountDeletion.js";
import type * as adminQueries from "../adminQueries.js";
import type * as adminUsers from "../adminUsers.js";
import type * as approvals from "../approvals.js";
import type * as approvalsExtra from "../approvalsExtra.js";
import type * as audit from "../audit.js";
import type * as auditExtra from "../auditExtra.js";
import type * as conversationContexts from "../conversationContexts.js";
import type * as digests from "../digests.js";
import type * as encryptedCredentials from "../encryptedCredentials.js";
import type * as fixRuns from "../fixRuns.js";
import type * as githubInstallations from "../githubInstallations.js";
import type * as inviteCodes from "../inviteCodes.js";
import type * as memories from "../memories.js";
import type * as notificationPreferences from "../notificationPreferences.js";
import type * as onboarding from "../onboarding.js";
import type * as outboundMessages from "../outboundMessages.js";
import type * as phoneIdentities from "../phoneIdentities.js";
import type * as phoneIdentitiesExtra from "../phoneIdentitiesExtra.js";
import type * as pullRequests from "../pullRequests.js";
import type * as pullRequestsExtra from "../pullRequestsExtra.js";
import type * as repositories from "../repositories.js";
import type * as repositoriesExtra from "../repositoriesExtra.js";
import type * as reviewFindings from "../reviewFindings.js";
import type * as reviewRuns from "../reviewRuns.js";
import type * as reviewRunsExtra from "../reviewRunsExtra.js";
import type * as scheduledActions from "../scheduledActions.js";
import type * as usageEvents from "../usageEvents.js";
import type * as userSettings from "../userSettings.js";
import type * as users from "../users.js";
import type * as webhookEvents from "../webhookEvents.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accessRequests: typeof accessRequests;
  accountDeletion: typeof accountDeletion;
  adminQueries: typeof adminQueries;
  adminUsers: typeof adminUsers;
  approvals: typeof approvals;
  approvalsExtra: typeof approvalsExtra;
  audit: typeof audit;
  auditExtra: typeof auditExtra;
  conversationContexts: typeof conversationContexts;
  digests: typeof digests;
  encryptedCredentials: typeof encryptedCredentials;
  fixRuns: typeof fixRuns;
  githubInstallations: typeof githubInstallations;
  inviteCodes: typeof inviteCodes;
  memories: typeof memories;
  notificationPreferences: typeof notificationPreferences;
  onboarding: typeof onboarding;
  outboundMessages: typeof outboundMessages;
  phoneIdentities: typeof phoneIdentities;
  phoneIdentitiesExtra: typeof phoneIdentitiesExtra;
  pullRequests: typeof pullRequests;
  pullRequestsExtra: typeof pullRequestsExtra;
  repositories: typeof repositories;
  repositoriesExtra: typeof repositoriesExtra;
  reviewFindings: typeof reviewFindings;
  reviewRuns: typeof reviewRuns;
  reviewRunsExtra: typeof reviewRunsExtra;
  scheduledActions: typeof scheduledActions;
  usageEvents: typeof usageEvents;
  userSettings: typeof userSettings;
  users: typeof users;
  webhookEvents: typeof webhookEvents;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
