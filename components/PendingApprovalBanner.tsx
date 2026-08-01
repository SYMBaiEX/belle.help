/**
 * Shown on the dashboard overview when the signed-in user's approvalStatus
 * is "pending" — invite-only Belle still lets them finish setup, but Belle
 * won't act on their repos until an admin approves the access request.
 */
export function PendingApprovalBanner() {
  return (
    <div
      className="mb-6 rounded-2xl border px-4 py-3 text-sm"
      style={{ borderColor: "var(--color-border)", background: "var(--color-warning-soft)", color: "var(--color-ink)" }}
    >
      Setup is saved. Belle starts working once your access is approved.
    </div>
  );
}
