"use client";

import Link from "next/link";

// Fixed top-left navigation used on the auth pages. When `onBack` is provided
// it renders a "Back" action (e.g. return to a previous step); otherwise it
// links Home.
export default function CornerNav({ onBack }) {
  const navClass =
    "inline-flex items-center gap-2 pl-30 text-sm font-semibold text-white/70 transition hover:text-white";

  return (
    <div className="fixed left-6 top-6 z-30">
      {onBack ? (
        <button type="button" onClick={onBack} className={navClass}>
          <span aria-hidden="true">&larr;</span> Back
        </button>
      ) : (
        <Link href="/" className={navClass}>
          <span aria-hidden="true">&larr;</span> Home
        </Link>
      )}
    </div>
  );
}
