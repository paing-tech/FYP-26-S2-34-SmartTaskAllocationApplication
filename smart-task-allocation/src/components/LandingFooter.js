"use client";

import { useSiteContent } from "@/lib/useSiteContent";
import Link from "next/link";

const SOCIAL_ICON_PATHS = {
  github:
    "M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.12-.31-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.18.77.84 1.23 1.91 1.23 3.23 0 4.63-2.81 5.65-5.49 5.95.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z",
  discord:
    "M20.32 4.37A19.8 19.8 0 0 0 15.43 2.85a13.6 13.6 0 0 0-.62 1.27 18.27 18.27 0 0 0-5.6 0 13.6 13.6 0 0 0-.63-1.27A19.74 19.74 0 0 0 3.68 4.37 20.26 20.26 0 0 0 .2 18.06a19.9 19.9 0 0 0 6.06 3.06c.49-.67.92-1.38 1.3-2.13a13 13 0 0 1-2.05-.98c.17-.13.34-.26.5-.39a14.21 14.21 0 0 0 12.1 0c.16.14.33.27.5.39-.65.39-1.34.72-2.06.98.37.74.81 1.46 1.3 2.13a19.84 19.84 0 0 0 6.06-3.06 20.23 20.23 0 0 0-3.49-13.69zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42s.95-2.43 2.16-2.43c1.21 0 2.18 1.09 2.16 2.43 0 1.34-.95 2.42-2.16 2.42zm7.96 0c-1.18 0-2.16-1.08-2.16-2.42s.95-2.43 2.16-2.43c1.21 0 2.18 1.09 2.16 2.43 0 1.34-.95 2.42-2.16 2.42z",
  telegram:
    "M23.91 3.79 20.3 20.84c-.25 1.21-.98 1.5-1.99.94l-5.5-4.07-2.66 2.57c-.3.3-.55.56-1.1.56l.38-5.56 10.12-9.14c.44-.39-.1-.61-.68-.22L6.4 13.06.96 11.36c-1.18-.37-1.2-1.18.25-1.75l21.26-8.2c.98-.37 1.84.22 1.44 2.38z",
};

// Unrecognized platform names (anything an admin adds beyond the three known
// ones) fall back to a generic link glyph instead of breaking.
export function SocialIcon({ name }) {
  const path = SOCIAL_ICON_PATHS[String(name ?? "").toLowerCase()];

  if (path) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <path d={path} />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export default function LandingFooter() {
  const footer = useSiteContent("footer");

  if (footer.hidden) {
    return null;
  }

  return (
    <footer className="relative w-full bg-black px-6 py-6 sm:px-10 lg:px-16">
      <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-6 lg:flex-row lg:justify-between">
        <p className="order-3 text-sm text-white/45 lg:order-1">{footer.copyrightText}</p>

        {/* Socials centered within the footer */}
        <div className="order-2 flex items-center gap-5 lg:absolute lg:left-1/2 lg:-translate-x-1/2">
          {(footer.socialLinks ?? []).map((social) => (
            <a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={social.name}
              className="text-white/45 transition hover:text-white"
            >
              <SocialIcon name={social.name} />
            </a>
          ))}
        </div>

        <div className="order-1 flex items-center gap-4 text-sm text-white/45 lg:order-3">
          <Link href="/feedback" className="transition hover:text-white">Feedback</Link>
          <Link href="/support" className="transition hover:text-white">Support</Link>
          <div className="group relative">
            <span className="cursor-default transition group-hover:text-white">{footer.aboutLabel}</span>
            <span className="pointer-events-none absolute bottom-full -right-16 mb-3 hidden whitespace-nowrap rounded-lg border border-white/15 bg-[#111] px-3 py-2 text-xs font-medium text-white/80 shadow-[0_10px_30px_rgba(0,0,0,0.5)] group-hover:block">
              {footer.aboutTooltip}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
