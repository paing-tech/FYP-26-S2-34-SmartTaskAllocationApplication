"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import CornerNav from "@/components/CornerNav";

const inputClass =
  "auth-dark-field h-14 w-full rounded-md border border-white/40 bg-black/40 px-4 text-base text-white outline-none transition-colors placeholder:text-white/40 focus:border-white/60 focus:ring-2 focus:ring-white/20";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.48a5.55 5.55 0 0 1-2.4 3.64v3.02h3.88c2.27-2.09 3.56-5.17 3.56-8.85Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3a7.2 7.2 0 0 1-10.7-3.79H1.4v3.11A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.37 14.31A7.2 7.2 0 0 1 5 12c0-.8.14-1.58.37-2.31V6.58H1.4A12 12 0 0 0 0 12c0 1.94.47 3.77 1.4 5.42l3.97-3.11Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44A11.94 11.94 0 0 0 12 0 12 12 0 0 0 1.4 6.58l3.97 3.11A7.18 7.18 0 0 1 12 4.77Z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

export default function AuthForm() {
  const router = useRouter();
  const [step, setStep] = useState("email"); // "email" | "password"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  const [appealSubmitted, setAppealSubmitted] = useState(false);
  const [isAppealFormOpen, setIsAppealFormOpen] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [appealError, setAppealError] = useState("");

  function resetToEmailStep() {
    setStep("email");
    setPassword("");
    setError("");
    setResetMessage("");
  }

  // Shared by the password flow and the OAuth return trip — an OAuth
  // provider redirects the whole page back to /login with a session
  // already established (the Supabase client parses it from the URL on
  // load), so there's no separate callback route to build.
  async function redirectIfSignedIn(supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return false;

    const routeResponse = await fetch("/api/home-route", {
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    });
    const routeResult = await routeResponse.json();

    if (routeResult.suspended) {
      setIsSuspended(true);
      return true;
    }

    if (!routeResponse.ok) {
      setError(`Login succeeded, but ${routeResult.error}`);
      return true;
    }

    router.push(routeResult.homeRoute);
    router.refresh();
    return true;
  }

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      try {
        await redirectIfSignedIn(supabase);
      } catch (sessionError) {
        setError(sessionError.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleOAuthSignIn(provider) {
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/login` },
      });
      if (oauthError) setError(oauthError.message);
    } catch (oauthError) {
      setError(oauthError.message);
    }
  }

  async function signIn() {
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
        return;
      }

      await redirectIfSignedIn(supabase);
    } catch (authError) {
      setError(authError.message);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setResetMessage("");
    setIsSubmitting(true);

    try {
      if (step === "email") {
        const response = await fetch("/api/account-exists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const result = await response.json();

        if (!response.ok) {
          setError(result.error || "Could not check that email.");
          return;
        }

        if (result.exists) {
          setStep("password");
        } else {
          setError("No account found for this email.");
        }
        return;
      }

      await signIn();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setResetMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setResetMessage("Password reset link sent. Check your email.");
    } catch (resetError) {
      setError(resetError.message);
    }
  }

  async function handleSuspendedLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setIsSuspended(false);
    setAppealSubmitted(false);
    setIsAppealFormOpen(false);
    setAppealReason("");
    setAppealError("");
    resetToEmailStep();
    router.refresh();
  }

  async function submitAppeal() {
    const reason = appealReason.trim();
    if (!reason || isSubmittingAppeal) return;

    setIsSubmittingAppeal(true);
    setAppealError("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch("/api/account-appeal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ reason }),
      });
      const result = await response.json();

      if (!response.ok) {
        setAppealError(result.error || "Could not submit your appeal.");
        return;
      }

      setAppealSubmitted(true);
      setIsAppealFormOpen(false);
    } catch (submitError) {
      setAppealError(submitError.message);
    } finally {
      setIsSubmittingAppeal(false);
    }
  }

  if (isSuspended) {
    return (
      <div className="w-full max-w-xl">
        <section className="rounded-[32px] border border-white/30 bg-white/20 backdrop-blur-xs px-10 py-12 text-center shadow-[0_28px_80px_rgba(0,0,0,0.42)]">
          <span
            className="material-symbols-outlined text-red-600"
            style={{ fontSize: "72px" }}
            aria-hidden="true"
          >
            account_circle_off
          </span>
          <p className="mt-5 text-xl font-bold text-[#0D1E4C]">
            Your organization has suspended your account.
          </p>

          {appealSubmitted ? (
            <p className="mx-auto mt-6 max-w-sm text-sm font-semibold text-emerald-700">
              Your appeal has been submitted.
            </p>
          ) : isAppealFormOpen ? (
            <div className="mx-auto mt-6 max-w-sm text-left">
              <textarea
                value={appealReason}
                onChange={(event) => setAppealReason(event.target.value)}
                placeholder="Explain why your account should be reactivated…"
                rows={4}
                autoFocus
                className="w-full resize-none rounded-2xl border border-white/40 bg-white/70 px-4 py-3 text-sm font-medium text-[#0D1E4C] outline-none placeholder:text-[#94a3b8] focus:border-[#2563EB]"
              />
              {appealError ? <p className="mt-2 text-xs font-bold text-red-600">{appealError}</p> : null}
            </div>
          ) : null}

          <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3">
            {appealSubmitted ? null : isAppealFormOpen ? (
              <button
                type="button"
                onClick={submitAppeal}
                disabled={!appealReason.trim() || isSubmittingAppeal}
                className="h-13 rounded-full bg-[#0D1E4C] px-6 font-bold text-white transition hover:brightness-120 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingAppeal ? "Submitting…" : "Submit Appeal"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsAppealFormOpen(true)}
                className="h-13 rounded-full bg-[#0D1E4C] px-6 font-bold text-white transition hover:brightness-120"
              >
                Appeal
              </button>
            )}
            <button
              type="button"
              onClick={handleSuspendedLogout}
              className="h-13 rounded-full border border-[#cbd5e1] bg-white px-6 font-bold text-[#0D1E4C] transition hover:bg-slate-100"
            >
              Log Out
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl">
      <CornerNav onBack={step === "password" ? resetToEmailStep : undefined} />
      <section className="rounded-[28px] border border-white/20 bg-white/10 px-8 py-10 shadow-[0_28px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:px-10">
        <div className="flex justify-center">
          <Image
            src="/optimalogowhite.png"
            alt="Optima"
            width={56}
            height={56}
            className="h-14 w-14 object-contain"
            priority
          />
        </div>
        <h1 className="mt-4 text-center text-3xl font-bold text-white">Sign in to Optima</h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {step === "email" ? (
            <div className="space-y-3">
              <label htmlFor="email" className="block text-base font-medium text-white/90">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                required
                autoFocus
                className={inputClass}
              />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-md border border-white/20 bg-white/10 px-4 py-3">
                <span className="min-w-0 truncate text-sm font-medium text-white/90">{email}</span>
                <button
                  type="button"
                  onClick={resetToEmailStep}
                  className="shrink-0 text-sm font-semibold text-white hover:underline"
                >
                  Change
                </button>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="block text-base font-medium text-white/90">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  minLength={6}
                  required
                  autoFocus
                  className={inputClass}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-sm font-semibold text-white hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>
            </>
          )}

          {error ? (
            <p className="pl-2 -mt-4 text-xs font-medium text-red-700">
              {error}
            </p>
          ) : null}

          {resetMessage ? (
            <p className="pl-2 -mt-4 text-xs font-medium text-esmerald-700">
              {resetMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-14 w-full rounded-full border border-white/20 bg-[#2563EB]/20 text-base uppercase font-bold text-white shadow-[0_8px_24px_rgba(37,99,235,0.60)] transition duration-200 hover:brightness-120 hover:shadow-[0_0_28px_rgba(37,99,235,0.6)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Authenticating…" : step === "email" ? "Continue" : "Sign in"}
          </button>

          {step === "email" ? (
            <>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-white/20" aria-hidden="true" />
                <span className="text-sm font-medium text-white/60">or</span>
                <span className="h-px flex-1 bg-white/20" aria-hidden="true" />
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleOAuthSignIn("azure")}
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-white text-base font-semibold text-[#1f1f1f] shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition hover:brightness-95"
                >
                  <MicrosoftIcon />
                  Sign in with Microsoft
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuthSignIn("google")}
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-white text-base font-semibold text-[#1f1f1f] shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition hover:brightness-95"
                >
                  <GoogleIcon />
                  Sign in with Google
                </button>
              </div>
            </>
          ) : null}
        </form>
      </section>

      <p className="mt-6 text-center text-base text-white/80">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-white transition hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]">
          Sign up
        </Link>
      </p>
    </div>
  );
}
