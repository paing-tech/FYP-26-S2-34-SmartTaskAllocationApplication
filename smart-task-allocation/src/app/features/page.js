"use client";

import LandingNav from "@/components/LandingNav";
import LanyardShowcase from "@/components/LanyardShowcase";
import FeatureShowcase from "@/components/FeatureShowcase";

// Dedicated home for the nav's "Features" link — same page shell as
// /pricing (LandingNav + intro + LanyardShowcase), reusing the existing
// FeatureShowcase component as-is rather than duplicating its content or
// heading (it already renders its own "Everything you need..." heading).
export default function FeaturesPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black pb-10 pt-32 text-white">
      <LandingNav />

      <section className="mx-auto mt-4 max-w-3xl px-6 text-center">
        <span className="rounded-full border border-white/15 px-4 py-1 text-lg font-medium text-white/80">
          Features
        </span>
        <p className="mt-6 text-base text-white/60">
          Everything below is live in the product, not a mockup — explore what each part actually does.
        </p>
      </section>

      <div className="mt-16">
        <FeatureShowcase />
      </div>

      <div className="-mx-6">
        <LanyardShowcase />
      </div>
    </main>
  );
}
