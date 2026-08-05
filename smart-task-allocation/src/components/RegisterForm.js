"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CornerNav from "@/components/CornerNav";

const inputClass =
  "h-14 w-full rounded-md border border-white/40 bg-black/40 px-4 text-base text-white outline-none transition-colors placeholder:text-white/40 focus:border-white/60 focus:ring-2 focus:ring-white/20";

const submitButtonClass =
  "h-14 w-full rounded-full border border-white/20 bg-[#2563EB]/20 text-base uppercase font-bold text-white shadow-[0_8px_24px_rgba(37,99,235,0.60)] transition duration-200 hover:brightness-120 hover:shadow-[0_0_28px_rgba(37,99,235,0.6)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/50 disabled:cursor-not-allowed disabled:opacity-60";

const HEADINGS = {
  choose: "Create your account",
  admin: "Create your admin account",
  join: "Join your organization",
};

function ErrorNote({ children }) {
  return (
    <p className="pl-2 -mt-4 text-xs font-medium text-red-700">
      {children}
    </p>
  );
}

function InfoNote({ children }) {
  return (
    <p className="pl-2 -mt-4 text-xs font-medium text-blue-400">
      {children}
    </p>
  );
}

function MaterialIcon({ name }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: "26px" }}>
      {name}
    </span>
  );
}

function ChoicePanel({ icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col items-start gap-4 rounded-2xl border border-white/20 bg-white/5 p-6 text-left transition duration-200 hover:border-white/40 hover:bg-white/10 hover:shadow-[0_0_28px_rgba(37,99,235,0.35)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/50"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2563EB]/20 text-[#93c5fd] transition group-hover:bg-[#2563EB]/30 group-hover:text-white">
        {icon}
      </span>
      <span className="whitespace-nowrap text-base font-bold text-white">{title}</span>
      <span className="text-xs leading-relaxed text-white/70">{description}</span>
    </button>
  );
}

function Chooser({ onChoose }) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <ChoicePanel
        icon={<MaterialIcon name="productivity" />}
        title="Create an Admin Account"
        description="Register as an administrator and set up your organization."
        onClick={() => onChoose("admin")}
      />
      <ChoicePanel
        icon={<MaterialIcon name="person_add" />}
        title="Join an Organization"
        description="Use the email address provided in your invitation to join your organization."
        onClick={() => onChoose("join")}
      />
    </div>
  );
}

function AdminForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Could not create your account.");
        setIsSubmitting(false);
        return;
      }

      setMessage("Account created. Redirecting to sign in...");
      setTimeout(() => router.push("/login"), 2000);
    } catch (signUpError) {
      setError(signUpError.message);
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div className="space-y-3">
          <label htmlFor="fullName" className="block text-base font-medium text-white/90">
            Full Name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Your name"
            required
            autoFocus
            className={inputClass}
          />
        </div>

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
            className={inputClass}
          />
        </div>

        <div className="space-y-3">
          <label htmlFor="password" className="block text-base font-medium text-white/90">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
            minLength={6}
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-3">
          <label htmlFor="confirmPassword" className="block text-base font-medium text-white/90">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Re-enter your password"
            minLength={6}
            required
            className={inputClass}
          />
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {message ? <InfoNote>{message}</InfoNote> : null}

        <button type="submit" disabled={isSubmitting} className={submitButtonClass}>
          {isSubmitting ? "Creating..." : "Create account"}
        </button>
    </form>
  );
}

function JoinForm({ initialEmail = "" }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [welcome, setWelcome] = useState(null); // { ok: boolean, text: string }
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prefill the email once it becomes available (e.g. from the invite link
  // session on the /accept-invite page).
  useEffect(() => {
    if (initialEmail) queueMicrotask(() => setEmail(initialEmail));
  }, [initialEmail]);

  // Live invitation lookup: when the email looks complete, check whether it has
  // an invitation and greet the user with their organization name.
  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      queueMicrotask(() => setWelcome(null));
      return;
    }

    let active = true;
    const handle = setTimeout(async () => {
      try {
        const response = await fetch("/api/invite-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        });
        const result = await response.json();
        if (!active) return;

        if (response.ok && result.found && result.status !== "Active" && result.organizationName) {
          setWelcome({ ok: true, text: `Welcome to ${result.organizationName}` });
        } else if (response.ok && result.found && result.status === "Active") {
          setWelcome({ ok: false, text: "This account is already registered. Please sign in instead." });
        } else {
          setWelcome({ ok: false, text: "No invitation found for this email." });
        }
      } catch {
        if (active) setWelcome(null);
      }
    }, 450);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [email]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/join-organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Could not complete your registration.");
        setIsSubmitting(false);
        return;
      }

      setMessage("You're all set. Redirecting to sign in...");
      setTimeout(() => router.push("/login"), 2000);
    } catch (joinError) {
      setError(joinError.message);
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      <div className="space-y-3">
        <label htmlFor="joinFullName" className="block text-base font-medium text-white/90">
          Full Name
        </label>
        <input
          id="joinFullName"
          name="fullName"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Your name"
          required
          autoFocus
          className={inputClass}
        />
      </div>

      <div className="space-y-3">
        <label htmlFor="joinEmail" className="block text-base font-medium text-white/90">
          Email
        </label>
        <input
          id="joinEmail"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
          required
          className={inputClass}
        />
        {welcome ? (
          <p
            className={`pl-2 text-sm font-medium ${
              welcome.ok ? "text-blue-400" : "text-red-700"
            }`}
          >
            {welcome.text}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <label htmlFor="joinPassword" className="block text-base font-medium text-white/90">
          Password
        </label>
        <input
          id="joinPassword"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Create a password"
          minLength={6}
          required
          className={inputClass}
        />
      </div>

      <div className="space-y-3">
        <label htmlFor="joinConfirmPassword" className="block text-base font-medium text-white/90">
          Confirm Password
        </label>
        <input
          id="joinConfirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Re-enter your password"
          minLength={6}
          required
          className={inputClass}
        />
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {message ? <InfoNote>{message}</InfoNote> : null}

      <button type="submit" disabled={isSubmitting} className={submitButtonClass}>
        {isSubmitting ? "Joining..." : "Join organization"}
      </button>
    </form>
  );
}

export default function RegisterForm({ initialMode = "choose", initialEmail = "" }) {
  const [mode, setMode] = useState(initialMode); // "choose" | "admin" | "join"

  return (
    <div className={`mx-auto w-full ${mode === "choose" ? "max-w-2xl" : "max-w-xl"}`}>
      <CornerNav onBack={mode === "choose" ? undefined : () => setMode("choose")} />
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
        <h1 className="mt-4 text-center text-3xl font-bold text-white">{HEADINGS[mode]}</h1>

        {mode === "choose" ? <Chooser onChoose={setMode} /> : null}
        {mode === "admin" ? <AdminForm /> : null}
        {mode === "join" ? <JoinForm initialEmail={initialEmail} /> : null}
      </section>

      <p className="mt-6 text-center text-base text-white/80">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-white transition hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
