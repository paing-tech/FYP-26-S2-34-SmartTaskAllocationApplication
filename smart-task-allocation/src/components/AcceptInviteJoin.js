"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import RegisterForm from "@/components/RegisterForm";

// Lands users who clicked the "Accept invitation" link straight on the unified
// join form, prefilling the email from the invite-link session when present.
export default function AcceptInviteJoin() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (active && data?.user?.email) {
          setEmail(data.user.email);
        }
      } catch {
        // No session (opened directly) — the user can type their email.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return <RegisterForm initialMode="join" initialEmail={email} />;
}
