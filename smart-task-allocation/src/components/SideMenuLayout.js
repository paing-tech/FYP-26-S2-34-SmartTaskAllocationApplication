"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { sideMenuNavigation } from "@/lib/sideMenuNavigation";
import TopInformationBar from "@/components/TopInformationBar";
import { useAppearance } from "@/components/appearance/AppearanceContext";
import AIAutomationChat from "@/components/AIAutomationChat";
import { PlanProvider, usePlanGate } from "@/components/PlanProvider";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { getAgentAvatarSrc } from "@/lib/agentAvatars";

function NavIcon({ name }) {
  const commonProps = {
    className: "h-5 w-5 shrink-0",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  if (name === "users") {
    return (
      <svg {...commonProps}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (name === "workspace") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }

  if (name === "tasks") {
    return (
      <svg {...commonProps}>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg {...commonProps}>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
      </svg>
    );
  }

  if (name === "attendance") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg {...commonProps}>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.5a2 2 0 0 1-1 1.73l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.73v-.5a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (name === "organization") {
    return (
      <svg {...commonProps}>
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6" />
        <path d="M9 10h.01" />
        <path d="M15 10h.01" />
      </svg>
    );
  }

  if (name === "tile_large") {
    // Material Symbols "tile_large" (outlined) — filled glyph, so it uses
    // its own attrs rather than commonProps' stroke-based line-icon style.
    return (
      <svg className="h-5 w-5 shrink-0" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
        <path d="M120-120v-240h320v240H120Zm400 0v-240h320v240H520Zm-320-80h160v-80H200v80Zm400 0h160v-80H600v80ZM120-440v-400h720v400H120Zm160 200Zm400 0Z" />
      </svg>
    );
  }

  if (name === "groups") {
    // Material Symbols "groups" (outlined) — filled glyph, same as tile_large above.
    return (
      <svg className="h-5 w-5 shrink-0" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
        <path d="M0-240v-63q0-43 44-70t116-27q13 0 25 .5t23 2.5q-14 21-21 44t-7 48v65H0Zm240 0v-65q0-32 17.5-58.5T307-410q32-20 76.5-30t96.5-10q53 0 97.5 10t76.5 30q32 20 49 46.5t17 58.5v65H240Zm540 0v-65q0-26-6.5-49T754-397q11-2 22.5-2.5t23.5-.5q72 0 116 26.5t44 70.5v63H780Zm-455-80h311q-10-20-55.5-35T480-370q-55 0-100.5 15T325-320ZM160-440q-33 0-56.5-23.5T80-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T160-440Zm640 0q-33 0-56.5-23.5T720-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T800-440Zm-320-40q-50 0-85-35t-35-85q0-51 35-85.5t85-34.5q51 0 85.5 34.5T600-600q0 50-34.5 85T480-480Zm0-80q17 0 28.5-11.5T520-600q0-17-11.5-28.5T480-640q-17 0-28.5 11.5T440-600q0 17 11.5 28.5T480-560Zm1 240Zm-1-280Z" />
      </svg>
    );
  }

  if (name === "agents") {
    return (
      <svg {...commonProps}>
        <rect x="4" y="8" width="16" height="11" rx="3" />
        <path d="M12 4v4" />
        <circle cx="12" cy="3" r="1" />
        <path d="M9 13h.01" />
        <path d="M15 13h.01" />
        <path d="M2 13v2" />
        <path d="M22 13v2" />
      </svg>
    );
  }

  if (name === "mail") {
    return (
      <svg {...commonProps}>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m2 6 10 7 10-7" />
      </svg>
    );
  }

  if (name === "content") {
    return (
      <svg {...commonProps}>
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
        <path d="M9 9h1" />
        <path d="M9 13h6" />
        <path d="M9 17h6" />
      </svg>
    );
  }

  if (name === "insights") {
    return (
      <svg {...commonProps}>
        <path d="M3 3v18h18" />
        <path d="M7 16v-4" />
        <path d="M12 16V8" />
        <path d="M17 16v-7" />
      </svg>
    );
  }

  if (name === "appearance") {
    return (
      <svg {...commonProps}>
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125 0-.926.746-1.688 1.688-1.688H16.5c3.038 0 5.5-2.462 5.5-5.5C22 6.04 17.51 2 12 2Z" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function SideMenuLayoutInner({ actor, children }) {
  const pathname = usePathname();
  const navigation = sideMenuNavigation[actor];
  const { backgroundStyle } = useAppearance();
  const { guard } = usePlanGate();
  const [isAutomationChatOpen, setIsAutomationChatOpen] = useState(false);
  const [agentAvatarKey, setAgentAvatarKey] = useState(null);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/agent", {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const result = await res.json();
      if (res.ok && result.agent) setAgentAvatarKey(result.agent.avatar_key);
    })();
  }, [actor]);

  return (
    <main className="h-screen overflow-hidden text-[#07183b]" style={backgroundStyle}>
      <TopInformationBar actor={actor} />
      <div className="flex h-[calc(100vh-3.5rem)] w-full gap-2 overflow-hidden pt-6 pl-1 pb-6 pr-2 sm:pl-2 sm:pr-2 lg:pl-2 lg:pr-2">
        <div className="z-50 hidden w-16 shrink-0 flex-col gap-2 md:flex">
          <aside className="group flex w-16 flex-col items-center rounded-[34px] bg-white/20 border border-white/60 py-6 backdrop-blur-sm shadow-sm transition-all duration-300 hover:w-56">
            <div className="flex w-full flex-col items-center gap-8">

              <nav
                className="flex w-full flex-col gap-6 px-2"
                aria-label={`${navigation.label} navigation`}
              >
                {navigation.items.map((item) => {
                  const isActive = pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      aria-label={item.label}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex h-12 w-full items-center gap-3 rounded-full px-3 transition-colors ${
                        isActive
                          ? "bg-[#0D1E4C] text-white shadow-[0_10px_24px_rgba(10,42,102,0.22)]"
                          : "text-[#0D1E4C] hover:bg-white/40"
                      }`}
                    >
                      <NavIcon name={item.icon} />

                      <span className="hidden whitespace-nowrap text-sm font-bold group-hover:block">
                        {item.label}
                      </span>
                    </Link>
                  );
                })}

                <Link
                  href="/appearance"
                  title="Appearance"
                  aria-label="Appearance"
                  aria-current={pathname === "/appearance" ? "page" : undefined}
                  className={`flex h-12 w-full items-center gap-3 rounded-full px-3 transition-colors ${
                    pathname === "/appearance"
                      ? "bg-[#0D1E4C] text-white shadow-[0_10px_24px_rgba(10,42,102,0.22)]"
                      : "text-[#0D1E4C] hover:bg-white/40"
                  }`}
                >
                  <NavIcon name="appearance" />

                  <span className="hidden whitespace-nowrap text-sm font-bold group-hover:block">
                    Appearance
                  </span>
                </Link>
              </nav>
            </div>
          </aside>

          <button
            type="button"
            onClick={() => {
              if (pathname.startsWith(`/${actor}/agents`)) return;
              guard("optimus_ai", () => setIsAutomationChatOpen(true));
            }}
            title="Optimus AI"
            aria-label="Open Optimus AI chat"
            className="flex h-14 w-14 shrink-0 items-center justify-center self-center overflow-hidden rounded-full border border-white/60 bg-white/20 text-[#2563EB] shadow-sm backdrop-blur-sm transition hover:scale-105 [&>svg]:h-7 [&>svg]:w-7"
          >
            {agentAvatarKey ? (
              <Image src={getAgentAvatarSrc(agentAvatarKey)} alt="" width={64} height={64} className="h-full w-full object-cover" />
            ) : (
              <NavIcon name="agents" />
            )}
          </button>
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          {children}
        </div>
      </div>

      {isAutomationChatOpen && !pathname.startsWith(`/${actor}/agents`) ? (
        <AIAutomationChat actor={actor} onClose={() => setIsAutomationChatOpen(false)} />
      ) : null}
    </main>
  );
}

export default function SideMenuLayout({ actor, children }) {
  return (
    <PlanProvider>
      <SideMenuLayoutInner actor={actor}>{children}</SideMenuLayoutInner>
    </PlanProvider>
  );
}
