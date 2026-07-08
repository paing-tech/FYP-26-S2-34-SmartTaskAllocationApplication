"use client";

import Link from "next/link";
import { Inter } from "next/font/google";
import LaserFlow from "@/components/LaserFlow";
import LandingNav from "@/components/LandingNav";
import LanyardShowcase from "@/components/LanyardShowcase";
import OrganizationLogoLoop from "@/components/OrganizationLogoLoop";
import FeatureShowcase from "@/components/FeatureShowcase";
import TestimonialsSection from "@/components/TestimonialsSection";
import LandingFooter from "@/components/LandingFooter";
import { useSiteContent } from "@/lib/useSiteContent";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export default function Home() {
  const hero = useSiteContent("hero");

  return (
    <main className={`${inter.className} overflow-x-hidden bg-black`}>
      <section className={`relative overflow-hidden ${hero.hidden ? "min-h-24" : "min-h-[140vh]"}`}>
        <LandingNav />

        {!hero.hidden ? (
          <>
            <div className="pointer-events-none absolute left-[50%] -top-20 z-[5] h-[145.5vh] min-h-[360px] w-screen -translate-x-1/2 overflow-hidden">
              <LaserFlow
                horizontalBeamOffset={0.1}
                verticalBeamOffset={0}
                horizontalSizing={0.6}
                verticalSizing={1.5}
                wispDensity={1}
                wispSpeed={15}
                wispIntensity={20}
                flowSpeed={0.35}
                flowStrength={0.25}
                fogIntensity={0.8}
                fogScale={0.3}
                fogFallSpeed={0.6}
                decay={1.1}
                falloffStart={1.2}
                color="#2563EB"
                className="absolute inset-0 translate-y-14"
              />
            </div>

            <div className="absolute left-[18%] top-[20%] z-10 max-w-[600px]">
              <h1 className="text-background font-bold leading-[1.2] tracking-[0.8] md:text-3xl lg:text-6xl bg-[linear-gradient(90deg,#FFFFFF_0%,#FFFFFF_30%,#2563EB_45%,#000000_95%)] bg-clip-text text-transparent">
                {hero.headline}
              </h1>
              <p className="mt-4 text-md font-light text-white">{hero.subheadline}</p>
              <Link
                href="/demo"
                className="mt-12 inline-flex h-14 min-w-56 items-center justify-center rounded-full border border-white/80 bg-white px-8 text-sm font-bold uppercase tracking-normal text-[#1E293B] shadow-[0_0_22px_rgba(37,99,235,0.7),0_0_48px_rgba(37,99,235,0.45)] transition hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(37,99,235,0.9),0_0_72px_rgba(37,99,235,0.55)]"
              >
                {hero.ctaLabel} <span className="ml-2 mb-1 text-2xl leading-none">→</span>
              </Link>
            </div>

            <section
              aria-label="Dashboard preview"
              className="absolute left-1/2 top-[70vh] z-[6] aspect-[1512/940] w-[65%] -translate-x-1/2 overflow-hidden rounded-[20px] border-2 border-[#2563EB] bg-[#120F17] shadow-[0_0_90px_rgba(37,99,235,0.9)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero.heroImageUrl}
                alt="Optima dashboard preview"
                className="h-full w-full object-contain"
              />
            </section>
          </>
        ) : null}
      </section>

      <FeatureShowcase />

      <TestimonialsSection />

      <OrganizationLogoLoop />

      <LanyardShowcase />

      <LandingFooter />

    </main>
  );
}
