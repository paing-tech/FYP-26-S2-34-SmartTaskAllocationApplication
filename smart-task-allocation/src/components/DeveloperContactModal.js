"use client";

import { useEffect, useRef } from "react";

// Shared "Contact Developer" card — used both from the authenticated app's
// TopInformationBar (Platform Admin, etc.) as a centered modal, and the
// public marketing footer's "About us" link as a small popover anchored
// above the trigger. `hideHeading` lets the footer trigger reuse the same
// card without the redundant "Contact Developer" title above it. `anchored`
// switches from the fixed, backdrop-blurred overlay to a popover that must
// be rendered inside a `relative` positioned parent (the trigger button's
// wrapper).
export default function DeveloperContactModal({ onClose, hideHeading = false, anchored = false }) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (!anchored) return undefined;

    function handleOutsideClick(event) {
      if (!cardRef.current?.contains(event.target)) onClose();
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [anchored, onClose]);

  const contacts = [
    {
      label: "GitHub",
      href: "https://github.com/paing-tech",
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
          <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.4-1.27.74-1.56-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.9 10.9 0 0 1 12 6.13c.98 0 1.95.13 2.87.38 2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.06.79 2.15v3.26c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
        </svg>
      ),
    },
    {
      label: "LinkedIn",
      href: "https://linkedin.com/in/paingthitxan",
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
          <path d="M5.34 7.67H1.82V22h3.52V7.67ZM3.58 2A2.07 2.07 0 1 0 3.58 6.14 2.07 2.07 0 0 0 3.58 2ZM22 13.78c0-4.32-2.3-6.33-5.38-6.33a4.63 4.63 0 0 0-4.2 2.31h-.05V7.67H9V22h3.52v-7.1c0-1.87.35-3.68 2.67-3.68 2.28 0 2.31 2.14 2.31 3.8V22H22v-8.22Z" />
        </svg>
      ),
    },
    {
      label: "Email",
      href: "mailto:paingthit.xan@gmail.com",
      icon: (
        <span className="material-symbols-outlined text-[26px]" aria-hidden="true">
          mail
        </span>
      ),
    },
  ];

  const card = (
    <section
      ref={cardRef}
      role="dialog"
      aria-modal={anchored ? undefined : "true"}
      aria-labelledby={hideHeading ? undefined : "developer-contact-title"}
      className={
        anchored
          ? "w-64 rounded-2xl border border-white/70 bg-slate-200/95 p-4 text-[#0D1E4C] shadow-[0_20px_60px_rgba(7,24,59,0.3)] backdrop-blur-xl"
          : "relative w-full max-w-md rounded-[36px] border border-white/70 bg-slate-200/90 p-8 text-[#0D1E4C] shadow-[0_28px_90px_rgba(7,24,59,0.25)] backdrop-blur-xl"
      }
    >
      {anchored ? null : (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close developer contact"
          className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/70"
        >
          <span className="material-symbols-outlined text-[26px]" aria-hidden="true">
            close
          </span>
        </button>
      )}
      <div className="flex flex-col items-center text-center">
        {hideHeading ? null : (
          <h2 id="developer-contact-title" className="text-2xl font-black">
            Contact Developer
          </h2>
        )}
        <div className={anchored ? "flex flex-col items-center" : "mt-4 flex flex-col items-center"}>
          <p className={anchored ? "text-base font-black" : "text-lg font-black"}>Paing Thit Xan</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">Full-Stack Developer</p>
        </div>
        <div className={anchored ? "mt-3 flex w-full justify-center gap-2.5" : "mt-6 flex w-full justify-center gap-4"}>
          {contacts.map((contact) => (
            <a
              key={contact.label}
              href={contact.href}
              target={contact.href.startsWith("mailto:") ? undefined : "_blank"}
              rel={contact.href.startsWith("mailto:") ? undefined : "noreferrer"}
              aria-label={contact.label}
              title={contact.label}
              className={
                anchored
                  ? "flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/55 transition hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-lg [&_svg]:h-4 [&_svg]:w-4 [&_.material-symbols-outlined]:text-[18px]"
                  : "flex h-14 w-14 items-center justify-center rounded-full border border-white/70 bg-white/55 transition hover:-translate-y-1 hover:bg-white/85 hover:shadow-lg"
              }
            >
              {contact.icon}
            </a>
          ))}
        </div>
      </div>
    </section>
  );

  if (anchored) {
    return <div className="absolute bottom-full -right-10 z-260 mb-3">{card}</div>;
  }

  return (
    <div
      className="fixed inset-0 z-260 flex items-center justify-center bg-slate-950/20 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {card}
    </div>
  );
}
