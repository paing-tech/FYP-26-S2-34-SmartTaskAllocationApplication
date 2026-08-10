"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

const Lanyard = dynamic(() => import("@/components/Lanyard"), {
  ssr: false,
});

// Lanyard + "Unlock Your Optima Experience" section, shared across pages.
export default function LanyardShowcase() {
  return (
    <section id="products" className="relative overflow-hidden bg-[#FFFFFF] px-6">
      <div className="relative mx-auto h-[620px] -left-[14%] w-[120%] overflow-hidden border-t border-t-neutral-300 bg-gradient-to-b from-[#FFFFFF] via-[#1E40AF] to-[#000000]">
        <Lanyard
          position={[0, 0, 20]}
          gravity={[0, -40, 0]}
          frontImage="/optimalogoblue.png"
          backImage="/lanyardcard.png"
          frontColor="#ffffff"
          frontImageScale={0.55}
          autoFlipInterval={3}
          flipSpeed={2}
          lanyardLogo="/optimalogowhite.png"
          lanyardColor="#000000"
          imageFit="contain"
        />
      </div>

      <div className="pointer-events-none absolute right-[10%] top-1/2 z-10 max-w-[800px] -translate-y-1/2">
        <h2 className="text-3xl font-bold leading-[1] tracking-tight text-white lg:text-5xl">
          Unlock Your Optima Experience
        </h2>
        <p className="mt-4 text-md font-light text-white/90">
          Join a smarter way of working with intelligent task management and seamless collaboration.
        </p>
        <div className="pointer-events-auto mt-6 flex flex-row items-start gap-4">
          <Link
            href="/demo"
            className="inline-flex h-14 min-w-56 items-center justify-center rounded-full border border-white/80 bg-white px-8 text-sm font-bold uppercase tracking-normal text-[#1E293B] shadow-[0_0_22px_rgba(37,99,235,0.7),0_0_48px_rgba(37,99,235,0.45)] transition hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(37,99,235,0.9),0_0_72px_rgba(37,99,235,0.55)]"
          >
            Discover What&apos;s Possible <span className="ml-2 mb-1 text-2xl leading-none">→</span>
          </Link>
          <Link
            href="/signup"
            className="rounded-full border border-[#1E40AF]/20 bg-[#1E40AF]/20 px-6 py-4 text-sm font-bold tracking-normal text-white shadow-[0_0_22px_rgba(37,99,235,0.55)] transition hover:border-[#2563EB]/80 hover:bg-[#2563EB]/40 hover:shadow-[0_0_34px_rgba(37,99,235,0.75)]"
          >
            Experience
          </Link>
        </div>
      </div>
    </section>
  );
}
