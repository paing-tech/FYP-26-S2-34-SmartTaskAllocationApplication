"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { markDemoSession } from "@/lib/demoClient";

export default function DemoPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    // Guard against React 18 double-invoke in dev so we provision only once.
    if (startedRef.current) return;
    startedRef.current = true;

    async function startDemo() {
      try {
        const response = await fetch("/api/demo/start", { method: "POST" });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Could not start the demo.");
        }

        const supabase = getSupabaseBrowserClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: result.email,
          password: result.password,
        });
        if (signInError) {
          throw new Error(signInError.message);
        }

        markDemoSession();
        router.replace("/manager/workspace");
      } catch (startError) {
        setError(startError.message);
      }
    }

    startDemo();
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center text-white">
      {error ? (
        <>
          <h1 className="text-2xl font-bold">Demo couldn&apos;t start</h1>
          <p className="mt-3 max-w-md text-sm text-white/70">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-full border border-white/60 bg-white px-6 py-2 text-sm font-bold text-[#1E293B] transition hover:scale-[1.02]"
          >
            Try again
          </button>
        </>
      ) : (
        <>
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-[#2563EB]" />
          <h1 className="mt-6 text-2xl font-bold">Setting up your demo…</h1>
          <p className="mt-3 max-w-md text-sm text-white/70">
            Spinning up a private sandbox with sample workspaces, teams and tasks. Nothing you do
            here is saved — it all disappears when you log out.
          </p>
        </>
      )}
    </main>
  );
}
