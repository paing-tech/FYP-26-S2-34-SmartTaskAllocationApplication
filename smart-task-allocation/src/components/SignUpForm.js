"use client";

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";

export default function SignUpForm({ onClose, onSuccess }) {
  const [mode, setMode] = useState("create");
  const [roles, setRoles] = useState([]);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function changeMode(nextMode) {
    setMode(nextMode);

    if (nextMode === "invite") {
      setPassword("");
      setUsername("");
    }
  }

  useEffect(() => {
    async function loadOptions() {
      setError("");

      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        const headers = {
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        };
        const rolesResponse = await fetch("/api/roles", { headers });
        const rolesResult = await rolesResponse.json();

        if (!rolesResponse.ok) {
          throw new Error(rolesResult.error || "Could not load roles.");
        }

        setRoles(rolesResult.roles);
        setRoleId(rolesResult.roles[0]?.role_id?.toString() ?? "");
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setIsLoadingRoles(false);
      }
    }

    loadOptions();
  }, []);

  function resetForm() {
    setEmail("");
    setUsername("");
    setPassword("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const response = await fetch(mode === "create" ? "/api/create-user" : "/api/invite-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          email,
          username,
          password,
          roleId,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not save account.");
      }

      setMessage(mode === "create" ? "Account created." : "Invitation sent.");
      resetForm();
      onSuccess?.();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="relative w-full max-w-md rounded-lg border border-[#d8e0ee] bg-white p-6 shadow-sm">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-slate-100/80 text-[#0D1E4C] backdrop-blur-sm transition hover:scale-110 hover:bg-slate-200"
        aria-label="Close sign up form"
      >
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          close
        </span>
      </button>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-[#061a40]">Sign Up</h2>
        <div className="mt-5 inline-flex rounded-full border border-[#b8c4d8] bg-[#f4f7fb] p-1">
          <button
            type="button"
            onClick={() => changeMode("create")}
            className={`h-9 rounded-full px-4 text-sm font-bold transition-colors ${
              mode === "create" ? "bg-[#0a2a66] text-white" : "text-[#061a40]"
            }`}
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => changeMode("invite")}
            className={`h-9 rounded-full px-4 text-sm font-bold transition-colors ${
              mode === "invite" ? "bg-[#0a2a66] text-white" : "text-[#061a40]"
            }`}
          >
            Invite
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-[#061a40]">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-11 w-full rounded-full border border-[#b8c4d8] px-4 text-sm outline-none focus:border-[#0a2a66] focus:ring-2 focus:ring-[#0a2a66]/20"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium text-[#061a40]">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required={mode === "create"}
            disabled={mode === "invite"}
            placeholder={mode === "invite" ? "Set by user" : ""}
            className="h-11 w-full rounded-full border border-[#b8c4d8] px-4 text-sm outline-none placeholder:text-slate-400 focus:border-[#0a2a66] focus:ring-2 focus:ring-[#0a2a66]/20 disabled:bg-slate-100 disabled:text-slate-500"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="username" className="block text-sm font-medium text-[#061a40]">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required={mode === "create"}
            disabled={mode === "invite"}
            placeholder={mode === "invite" ? "Set by user" : ""}
            className="h-11 w-full rounded-full border border-[#b8c4d8] px-4 text-sm outline-none placeholder:text-slate-400 focus:border-[#0a2a66] focus:ring-2 focus:ring-[#0a2a66]/20 disabled:bg-slate-100 disabled:text-slate-500"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="role" className="block text-sm font-medium text-[#061a40]">
            Role
          </label>
          <select
            id="role"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            disabled={isLoadingRoles}
            required
            className="h-11 w-full rounded-full border border-[#b8c4d8] bg-white px-4 text-sm outline-none focus:border-[#0a2a66] focus:ring-2 focus:ring-[#0a2a66]/20 disabled:bg-slate-100"
          >
            {roles.map((role) => (
              <option key={role.role_id} value={role.role_id}>
                {role.role_name}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-[#0a2a66]">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isLoadingRoles || isSubmitting}
          className="h-11 w-full rounded-full bg-[#0a2a66] px-5 text-sm font-bold text-white transition-colors hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Saving..." : mode === "create" ? "Create Account" : "Send Invite"}
        </button>
      </form>
    </section>
  );
}
