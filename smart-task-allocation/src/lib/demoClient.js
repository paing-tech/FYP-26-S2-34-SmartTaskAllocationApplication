"use client";

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const DEMO_KEY = "optima:demo";

// A demo session is purely client-flagged; the backing account is a real but
// throwaway Supabase user that gets deleted on exit.
export function isDemoSession() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(DEMO_KEY) === "1";
}

export function markDemoSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DEMO_KEY, "1");
}

export function clearDemoSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(DEMO_KEY);
}

export async function demoAuthHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

export const DEMO_ROLES = [
  { key: "useradmin", label: "User Admin", home: "/useradmin/accounts" },
  { key: "manager", label: "Manager", home: "/manager/workspace" },
  { key: "employee", label: "Employee", home: "/employee/workspace" },
];
