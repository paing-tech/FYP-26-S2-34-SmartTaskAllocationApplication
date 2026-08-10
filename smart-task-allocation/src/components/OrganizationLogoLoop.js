"use client";

import { useEffect, useState } from "react";
import LogoLoop from "@/components/LogoLoop";

export default function OrganizationLogoLoop() {
  const [organizations, setOrganizations] = useState([]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/public-organizations");
        const result = await response.json();
        if (active && response.ok) {
          setOrganizations(result.organizations ?? []);
        }
      } catch {
        // Marketing strip is non-critical; fail silently if it can't load.
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  if (!organizations.length) {
    return null;
  }

  const logos = organizations.map((org) => ({
    name: org.organization_name,
    logoUrl: org.logo_url,
  }));

  return (
    <section className="relative w-full bg-white py-16">
      <p className="mb-10 text-center text-md font-bold uppercase tracking-[0.25em] text-neutral-500">
        Powering High-performing Teams
      </p>
      <LogoLoop
        logos={logos}
        speed={70}
        direction="left"
        logoHeight={40}
        gap={72}
        pauseOnHover
        scaleOnHover
        fadeOut
        fadeOutColor="#ffffff"
        ariaLabel="Organizations using Optima"
        renderItem={(item) => (
          <span className="inline-flex items-center gap-3 whitespace-nowrap text-xl font-semibold text-black">
            {item.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.logoUrl}
                alt={item.name}
                className="h-10 w-auto object-contain"
                loading="lazy"
                decoding="async"
              />
            ) : null}
            <span>{item.name}</span>
          </span>
        )}
      />
    </section>
  );
}
