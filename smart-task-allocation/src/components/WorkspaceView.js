"use client";

import { useState } from "react";
import WorkspaceCalendar from "@/components/WorkspaceCalendar";
import WorkspaceBoard from "@/components/WorkspaceBoard";

const VIEWS = [
  { id: "calendar", label: "Calendar" },
  { id: "board", label: "Board" },
];

export default function WorkspaceView() {
  const [view, setView] = useState("calendar");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* View switcher */}
      <div className="mb-4 flex shrink-0 justify-center">
        <div className="inline-flex rounded-full border border-white/60 bg-white/30 p-1 backdrop-blur-sm">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setView(option.id)}
              className={`rounded-full px-6 py-2 text-sm font-bold transition ${
                view === option.id
                  ? "bg-[#0D1E4C] text-white shadow-sm"
                  : "text-[#0D1E4C] hover:bg-white/60"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {view === "calendar" ? <WorkspaceCalendar /> : <WorkspaceBoard />}
      </div>
    </div>
  );
}
