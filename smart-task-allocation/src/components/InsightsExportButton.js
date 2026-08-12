"use client";

// Icon-only twin of the Accounts page's "Export data" button — same
// "download" glyph, shrunk to fit in a card header next to (or in place
// of) the Week/Month toggle instead of a full pill with a label.
export default function InsightsExportButton({ onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#0D1E4C] transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
        download
      </span>
    </button>
  );
}
