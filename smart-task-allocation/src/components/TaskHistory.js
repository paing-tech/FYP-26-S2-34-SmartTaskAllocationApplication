"use client";

import { useMemo } from "react";

function formatDateTime(iso) {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

// Full-screen expansion of the workspace's compact activity pill — two
// sections: completed tasks (moved off the active board once marked done)
// and the full sentence-style activity feed (completions + assignments).
export default function TaskHistory({ activity = [], onClose }) {
  const completedTasks = useMemo(
    () => activity.filter((entry) => entry.type === "status_change" && entry.toStatus === "Completed"),
    [activity],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
        <h2 className="text-lg font-black text-[#0D1E4C]">Task History</h2>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task history"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-white/40 text-[#0D1E4C] backdrop-blur-sm transition hover:scale-110 hover:bg-white/70"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              close
            </span>
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto pr-1">
        <section>
          <h3 className="mb-3 text-sm font-black uppercase tracking-[0.15em] text-[#0D1E4C]/60">
            Completed tasks
          </h3>
          <div className="space-y-2">
            {completedTasks.length ? (
              completedTasks.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-white/50 bg-white/30 px-4 py-3 backdrop-blur-sm"
                >
                  <span className="min-w-0 truncate rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                    {entry.taskTitle}
                  </span>
                  <span className="shrink-0 text-sm text-[#52627a]">{formatDateTime(entry.occurredAt)}</span>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-white/60 px-6 py-8 text-center text-sm font-medium text-[#0D1E4C]/60">
                No completed tasks yet.
              </p>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-black uppercase tracking-[0.15em] text-[#0D1E4C]/60">Activity</h3>
          <div className="space-y-2">
            {activity.length ? (
              activity.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-white/50 bg-white/30 px-4 py-3 backdrop-blur-sm"
                >
                  {entry.type === "assignment" ? (
                    <>
                      <span className="rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 text-sm font-bold text-[#0D1E4C]">
                        {entry.assignedBy}
                      </span>
                      <span className="text-sm text-[#52627a]">assigned</span>
                      <span className="rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 text-sm font-bold text-[#0D1E4C]">
                        {entry.taskTitle}
                      </span>
                      <span className="text-sm text-[#52627a]">to you</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-[#52627a]">You marked</span>
                      <span className="rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 text-sm font-bold text-[#0D1E4C]">
                        {entry.taskTitle}
                      </span>
                      <span className="text-sm text-[#52627a]">as</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                        {entry.toStatus}
                      </span>
                    </>
                  )}
                  <span className="ml-auto shrink-0 text-sm text-[#52627a]">{formatDateTime(entry.occurredAt)}</span>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-white/60 px-6 py-8 text-center text-sm font-medium text-[#0D1E4C]/60">
                No activity yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
