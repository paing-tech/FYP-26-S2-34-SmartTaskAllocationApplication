"use client";

import LandingNav from "@/components/LandingNav";
import LanyardShowcase from "@/components/LanyardShowcase";
import FeaturesPageShowcase from "@/components/FeaturesPageShowcase";

// Dedicated home for the nav's "Features" link — same page shell as
// /pricing (LandingNav + LanyardShowcase), with FeaturesPageShowcase's own
// centered "Features" title standing in for a separate intro section.
export default function FeaturesPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black pb-10 pt-32 text-white">
      <LandingNav />

      <div>
        <FeaturesPageShowcase />
      </div>

      <div className="-mx-6">
        <LanyardShowcase />
      </div>
    </main>
  );
}
