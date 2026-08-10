"use client";

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useEffect, useRef, useState } from "react";

const inputClass =
  "signup-light-field h-10 w-full rounded-md border border-[#b8c4d8] bg-white px-5 text-sm text-[#061a40] outline-none transition-colors placeholder:text-[#061a40]/40 focus:border-[#0a2a66] focus:ring-2 focus:ring-[#0a2a66]/20 disabled:bg-slate-100 disabled:text-slate-500";

export default function SignUpForm({ onClose, onSuccess }) {
  const [mode, setMode] = useState("create");
  const [roles, setRoles] = useState([]);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const roleMenuRef = useRef(null);

  useEffect(() => {
    function closeRoleMenu(event) {
      if (!roleMenuRef.current?.contains(event.target)) {
        setIsRoleMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeRoleMenu);
    return () => document.removeEventListener("pointerdown", closeRoleMenu);
  }, []);

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
    <section className="relative w-full max-w-md rounded-[28px] border border-[#d8e0ee] bg-slate-100 px-10 pt-8 pb-10 shadow-[0_28px_80px_rgba(0,0,0,0.25)]">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-slate-100/80 text-[#0D1E4C] backdrop-blur-sm transition hover:scale-110 hover:bg-slate-200"
        aria-label="Close sign up form"
      >
        <span className="material-symbols-outlined text-xl" aria-hidden="true">
          close
        </span>
      </button>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-[#061a40]">Sign Up</h2>
        <div className="mt-4 inline-flex rounded-full border border-[#b8c4d8] bg-[#f4f7fb] p-1">
          <button
            type="button"
            onClick={() => changeMode("create")}
            className={`h-8 rounded-full px-4 text-xs font-bold transition-colors ${
              mode === "create" ? "bg-[#0a2a66] text-white" : "text-[#061a40]"
            }`}
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => changeMode("invite")}
            className={`h-8 rounded-full px-4 text-xs font-bold transition-colors ${
              mode === "invite" ? "bg-[#0a2a66] text-white" : "text-[#061a40]"
            }`}
          >
            Invite
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-[#061a40]">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            required
            className={inputClass}
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
            placeholder={mode === "invite" ? "Set by user" : "Create a password"}
            className={inputClass}
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
            placeholder={mode === "invite" ? "Set by user" : "Choose a username"}
            className={inputClass}
          />
        </div>

        <div ref={roleMenuRef} className="relative space-y-2">
          <label htmlFor="role" className="block text-sm font-medium text-[#061a40]">
            Role
          </label>
          <button
            type="button"
            id="role"
            onClick={() => setIsRoleMenuOpen((open) => !open)}
            disabled={isLoadingRoles}
            className={`${inputClass} flex items-center justify-between text-left`}
            aria-haspopup="listbox"
            aria-expanded={isRoleMenuOpen}
          >
            <span>{roles.find((role) => role.role_id.toString() === roleId)?.role_name ?? "Select a role"}</span>
            <svg
              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isRoleMenuOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {isRoleMenuOpen ? (
            <div
              role="listbox"
              aria-label="Role"
              className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-white/70 bg-white/60 p-1.5 shadow-[0_18px_45px_rgba(13,30,76,0.22)] backdrop-blur-xl"
            >
              {roles.map((role) => {
                const value = role.role_id.toString();
                const isSelected = value === roleId;

                return (
                  <button
                    key={role.role_id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      setRoleId(value);
                      setIsRoleMenuOpen(false);
                    }}
                    className={`flex w-full items-center rounded-xl px-4 py-2 text-left text-xs font-medium transition ${
                      isSelected
                        ? "bg-[#0a2a66] text-white"
                        : "text-[#061a40] hover:bg-white/70"
                    }`}
                  >
                    {role.role_name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-5 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-md border border-blue-200 bg-blue-50 px-5 py-2 text-xs font-medium text-[#0a2a66]">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isLoadingRoles || !roleId || isSubmitting}
          className="h-10 w-full rounded-full bg-[#0a2a66] px-5 text-sm font-bold uppercase text-white transition-colors hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Saving..." : mode === "create" ? "Create Account" : "Send Invite"}
        </button>
      </form>
    </section>
  );
}
