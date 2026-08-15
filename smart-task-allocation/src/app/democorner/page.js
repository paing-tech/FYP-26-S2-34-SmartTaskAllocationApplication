"use client";

import Link from "next/link";
import LandingNav from "@/components/LandingNav";
import LanyardShowcase from "@/components/LanyardShowcase";

// A separate showcase/explainer page for the nav's "Demo" link — distinct
// from /demo itself, which is the no-choice auto-provision-and-sign-in flow
// (see src/app/demo/page.js). This page previews what the sandbox actually
// contains before sending visitors into it, same spirit as /features
// explaining the product before showing it live.
const ROLES = [
  {
    label: "User Admin",
    description: "Manage accounts and invitations, build your org chart, and view workforce insights across the whole organization.",
  },
  {
    label: "Manager",
    description: "Run the task board — create and assign work, let Optimus AI match tasks to the right person, and track your team's progress.",
  },
  {
    label: "Employee",
    description: "See your own tasks and schedule, ask Optimus AI what's on your plate today, and mark work complete as you go.",
  },
];

export default function DemoCornerPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black pb-10 pt-32 text-white">
      <LandingNav />

      <section className="mx-auto mt-4 max-w-3xl px-6 text-center">
        <span className="rounded-full border border-white/15 px-4 py-1 text-lg font-medium text-white/80">
          Demo
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">Try Optima before you commit</h1>
        <p className="mt-4 text-base text-white/60">
          A private sandbox with sample workspaces, teams, and tasks already set up. Switch between roles to see
          the product from every angle. Nothing you do is saved — it all disappears when you log out.
        </p>
      </section>

      <section className="mx-auto mt-16 grid max-w-5xl gap-6 px-6 sm:grid-cols-3">
        {ROLES.map((role) => (
          <div
            key={role.label}
            className="rounded-3xl border border-white/15 bg-white/5 p-6 text-left backdrop-blur-sm"
          >
            <p className="text-lg font-bold">{role.label}</p>
            <p className="mt-3 text-sm leading-relaxed text-white/60">{role.description}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-14 flex max-w-3xl justify-center px-6">
        <Link
          href="/demo"
          className="inline-flex h-14 min-w-56 items-center justify-center rounded-full border border-white/80 bg-white px-8 text-sm font-bold uppercase tracking-normal text-[#1E293B] shadow-[0_0_22px_rgba(37,99,235,0.7),0_0_48px_rgba(37,99,235,0.45)] transition hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(37,99,235,0.9),0_0_72px_rgba(37,99,235,0.55)]"
        >
          Launch demo <span className="ml-2 mb-1 text-2xl leading-none">→</span>
        </Link>
      </section>

      <div className="-mx-6 mt-20">
        <LanyardShowcase />
      </div>
    </main>
  );
}
