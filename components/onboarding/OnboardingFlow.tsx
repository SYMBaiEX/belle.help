"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OnboardingStepper } from "./OnboardingStepper";

type Step = "welcome" | "ai" | "github" | "repos" | "done" | "error";

interface RepoRow {
  _id: string;
  fullName: string;
  watchEnabled: boolean;
  autonomyLevel: number;
  notifyDrafts: boolean;
  notifyCiFailures: boolean;
}

const AUTONOMY_LABELS = [
  "0 · Watch only",
  "1 · Review on request",
  "2 · Auto-review",
  "3 · Approved fixes",
  "4 · Full autonomy within guardrails",
];

const stepIndex: Record<Step, number> = {
  welcome: 0,
  ai: 1,
  github: 2,
  repos: 3,
  done: 4,
  error: 0,
};

const githubInstallUrl = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL;

export function OnboardingFlow({
  token,
  signedIn,
}: {
  token: string | null;
  signedIn: boolean;
}) {
  const [step, setStep] = useState<Step>(signedIn ? "ai" : "welcome");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [aiMode, setAiMode] = useState<"byok" | "managed" | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [savedKeyLast4, setSavedKeyLast4] = useState<string | null>(null);

  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [reposLoaded, setReposLoaded] = useState(false);

  const [confirmationText, setConfirmationText] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn && !token) {
      setStep("error");
      setErrorMessage("This link is missing or malformed. Text Belle again for a fresh link.");
    }
  }, [signedIn, token]);

  async function verify() {
    if (!token) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/onboarding/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error?.message ?? "That link didn't work. Text Belle again for a fresh one.");
        setStep("error");
        return;
      }
      setStep("ai");
    } catch {
      setErrorMessage("Something went wrong reaching Belle. Try again in a moment.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  async function chooseAiMode(mode: "byok" | "managed") {
    setAiMode(mode);
    if (mode === "managed") {
      setBusy(true);
      try {
        await fetch("/api/onboarding/ai-mode", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ aiMode: "managed" }),
        });
      } finally {
        setBusy(false);
      }
    }
  }

  async function saveApiKey() {
    if (!apiKey.trim()) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/settings/ai-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error?.message ?? "Couldn't save that key.");
        return;
      }
      setSavedKeyLast4(data.last4);
      setApiKey("");
    } finally {
      setBusy(false);
    }
  }

  async function continueToGithub() {
    setStep("github");
  }

  async function confirmGithubInstalled() {
    setBusy(true);
    try {
      await fetch("/api/onboarding/github-check", { method: "POST" });
      await loadRepos();
      setStep("repos");
    } finally {
      setBusy(false);
    }
  }

  async function loadRepos() {
    try {
      const res = await fetch("/api/repositories");
      if (res.ok) {
        const data = await res.json();
        setRepos(data.repositories ?? []);
      }
    } finally {
      setReposLoaded(true);
    }
  }

  async function toggleWatch(repo: RepoRow) {
    const next = !repo.watchEnabled;
    setRepos((prev) => prev.map((r) => (r._id === repo._id ? { ...r, watchEnabled: next } : r)));
    await fetch(`/api/repositories/${repo._id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ watchEnabled: next }),
    });
  }

  async function setAutonomy(repo: RepoRow, level: number) {
    setRepos((prev) => prev.map((r) => (r._id === repo._id ? { ...r, autonomyLevel: level } : r)));
    await fetch(`/api/repositories/${repo._id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autonomyLevel: level }),
    });
  }

  async function finish() {
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const data = await res.json();
      setConfirmationText(data.confirmationText ?? null);
      setStep("done");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      {step !== "error" ? (
        <div className="mb-8">
          <OnboardingStepper step={stepIndex[step]} />
        </div>
      ) : null}

      {step === "error" ? (
        <ErrorPanel message={errorMessage ?? "Something went wrong."} />
      ) : step === "welcome" ? (
        <Panel>
          <h1 className="text-2xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
            Hey — I&apos;m Belle.
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            I watch your repos, review pull requests, and fix what you approve. Let&apos;s get you
            set up — it takes about a minute.
          </p>
          <PrimaryButton onClick={verify} disabled={busy}>
            {busy ? "Verifying…" : "Let's go"}
          </PrimaryButton>
        </Panel>
      ) : step === "ai" ? (
        <Panel>
          <StepHeading title="How should I run AI?" />
          <div className="mt-5 space-y-3">
            <ModeCard
              selected={aiMode === "byok"}
              title="Use my OpenAI API key"
              body="Encrypted at rest. Billed directly to your OpenAI account. Never shown again after you save it."
              onClick={() => chooseAiMode("byok")}
            />
            {aiMode === "byok" ? (
              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
              >
                {savedKeyLast4 ? (
                  <p className="text-sm" style={{ color: "var(--color-success)" }}>
                    Saved — sk-…{savedKeyLast4}
                  </p>
                ) : (
                  <>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
                    />
                    <button
                      type="button"
                      onClick={saveApiKey}
                      disabled={busy || !apiKey.trim()}
                      className="mt-3 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
                    >
                      Save key
                    </button>
                  </>
                )}
              </div>
            ) : null}

            <ModeCard
              selected={aiMode === "managed"}
              title="Belle-hosted AI"
              body="Default. No key required — usage limits apply, with billing details coming as access opens."
              onClick={() => chooseAiMode("managed")}
            />

            <ModeCard
              disabled
              title="Use my ChatGPT / Codex plan"
              body="Not available — OpenAI doesn't currently permit third-party apps to use ChatGPT subscriptions for inference."
            />
          </div>
          <PrimaryButton
            onClick={continueToGithub}
            disabled={busy || (aiMode === "byok" && !savedKeyLast4) || aiMode === null}
          >
            Continue
          </PrimaryButton>
        </Panel>
      ) : step === "github" ? (
        <Panel>
          <StepHeading title="Connect GitHub" />
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            Install the Belle GitHub App on the repositories you want watched. You choose exactly
            which repos to grant access to.
          </p>
          {githubInstallUrl ? (
            <a
              href={githubInstallUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 block rounded-full px-5 py-3 text-center text-sm font-semibold"
              style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
            >
              Install the GitHub App
            </a>
          ) : (
            <div
              className="mt-5 rounded-xl border p-4 text-sm"
              style={{ borderColor: "var(--color-border)", background: "var(--color-warning-soft)", color: "var(--color-ink)" }}
            >
              GitHub connector not configured yet — your operator needs to run{" "}
              <code>vercel connect create github</code>.
            </div>
          )}
          <PrimaryButton onClick={confirmGithubInstalled} disabled={busy}>
            {busy ? "Checking…" : "I've installed it"}
          </PrimaryButton>
        </Panel>
      ) : step === "repos" ? (
        <Panel>
          <StepHeading title="Repositories & watch" />
          {!reposLoaded ? (
            <p className="mt-4 text-sm" style={{ color: "var(--color-ink-faint)" }}>
              Loading…
            </p>
          ) : repos.length === 0 ? (
            <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              Repos appear here once the GitHub App install completes — you can also finish later
              from the dashboard.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {repos.map((repo) => (
                <div
                  key={repo._id}
                  className="rounded-xl border p-4"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                      {repo.fullName}
                    </p>
                    <label className="inline-flex shrink-0 items-center gap-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                      Watch
                      <input
                        type="checkbox"
                        checked={repo.watchEnabled}
                        onChange={() => toggleWatch(repo)}
                      />
                    </label>
                  </div>
                  <select
                    value={repo.autonomyLevel}
                    onChange={(e) => setAutonomy(repo, Number(e.target.value))}
                    className="mt-3 w-full rounded-lg border px-2 py-1.5 text-xs"
                    style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-ink)" }}
                  >
                    {AUTONOMY_LABELS.map((label, i) => (
                      <option key={label} value={i}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          <PrimaryButton onClick={finish} disabled={busy}>
            {busy ? "Finishing…" : "Finish setup"}
          </PrimaryButton>
        </Panel>
      ) : (
        <Panel>
          <StepHeading title="You're all set" />
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            Belle texted a confirmation to your phone.
          </p>
          {confirmationText ? (
            <div
              className="mt-4 rounded-xl border px-3.5 py-3 text-sm"
              style={{ borderColor: "var(--color-border)", background: "var(--color-imessage-gray)", color: "var(--color-ink)" }}
            >
              {confirmationText}
            </div>
          ) : null}
          <Link
            href="/dashboard"
            className="mt-6 block rounded-full px-5 py-3 text-center text-sm font-semibold"
            style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
          >
            Go to dashboard
          </Link>
        </Panel>
      )}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border p-6 shadow-soft"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
    >
      {children}
    </div>
  );
}

function StepHeading({ title }: { title: string }) {
  return (
    <h1 className="text-xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
      {title}
    </h1>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-6 w-full rounded-full px-5 py-3 text-sm font-semibold transition-opacity disabled:opacity-50"
      style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
    >
      {children}
    </button>
  );
}

function ModeCard({
  title,
  body,
  selected,
  disabled,
  onClick,
}: {
  title: string;
  body: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
        background: selected ? "var(--color-accent-soft)" : "var(--color-bg-elevated)",
      }}
    >
      <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
        {title}
      </p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        {body}
      </p>
    </button>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <Panel>
      <h1 className="text-xl" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
        That link didn&apos;t work
      </h1>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        {message}
      </p>
    </Panel>
  );
}
