"use client";

import { useMemo, useState } from "react";
import { TaskCard, TaskViewPanel } from "@/components/WorkspaceBoard";

function formatDateHeader(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso) {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

function formatCardDate(iso) {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

// Full-screen expansion of the workspace's compact activity pill — two
// independently-scrolling sections: completed tasks as full task cards in a
// horizontal row, and the sentence-style activity feed grouped by date
// underneath (same grouping AllocationHistory uses).
export default function TaskHistory({ activity = [], completedTasks = [], employees = [], onClose, onReopenTask }) {
  const [viewingTaskId, setViewingTaskId] = useState(null);
  const [search, setSearch] = useState("");
  const viewingTask = viewingTaskId
    ? completedTasks.find((task) => task.task_id === viewingTaskId) ?? null
    : null;

  const groupedActivity = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = normalizedSearch
      ? activity.filter((entry) => {
          const searchable = `${entry.taskTitle ?? ""} ${entry.assignedBy ?? ""} ${entry.toStatus ?? ""}`;
          return searchable.toLowerCase().includes(normalizedSearch);
        })
      : activity;

    const groups = [];
    const indexByDate = new Map();

    for (const entry of filtered) {
      const dateKey = formatDateHeader(entry.occurredAt);
      if (!indexByDate.has(dateKey)) {
        indexByDate.set(dateKey, groups.length);
        groups.push({ dateKey, items: [] });
      }
      groups[indexByDate.get(dateKey)].items.push(entry);
    }

    return groups;
  }, [activity, search]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
        <h2 className="text-lg font-black text-[#0D1E4C]">Task History</h2>

        <div className="flex items-center gap-2">
          <div className="relative w-72">
            <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[#64748B]" aria-hidden="true">
              search
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search history"
              className="h-11 w-full rounded-full border border-[#C7DDEB] bg-white pl-11 pr-6 text-base text-[#0B1B32] shadow-sm outline-none placeholder:text-[#64748B] focus:border-[#83A6CE] focus:ring-2 focus:ring-[#83A6CE]/25"
            />
          </div>

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
      </div>

      <div className="shrink-0">
        {completedTasks.length ? (
          <div className="flex gap-6 overflow-x-auto pb-2">
            {completedTasks.map((task) => (
              <div key={task.task_id} className="w-80 shrink-0">
                <TaskCard
                  employees={employees}
                  onOpen={(openedTask) => setViewingTaskId(openedTask.task_id)}
                  task={task}
                  tasks={completedTasks}
                  viewOnly
                />
                <p className="mt-1.5 px-1 text-center text-xs font-semibold text-[#94a3b8]">
                  {formatCardDate(task.updated_at)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-white/60 px-6 py-8 text-center text-sm font-medium text-[#0D1E4C]/60">
            No completed tasks yet.
          </p>
        )}
      </div>

      <div className="mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
        {groupedActivity.length ? (
          groupedActivity.map((group) => (
            <div key={group.dateKey}>
              <h3 className="mb-3 text-sm font-black uppercase tracking-[0.15em] text-[#0D1E4C]/60">
                {group.dateKey}
              </h3>
              <div className="space-y-2">
                {group.items.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-white/50 bg-white/30 px-4 py-3 backdrop-blur-sm"
                  >
                    {entry.type === "assignment" ? (
                      <>
                        <span className="text-sm text-[#52627a]">You were assigned</span>
                        <span className="rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 text-sm font-bold text-[#0D1E4C]">
                          {entry.taskTitle}
                        </span>
                        <span className="text-sm text-[#52627a]">by</span>
                        <span className="rounded-full border border-[#0D1E4C]/15 bg-white/70 px-3 py-1 text-sm font-bold text-[#0D1E4C]">
                          {entry.assignedBy}
                        </span>
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
                    <span className="ml-auto shrink-0 text-sm text-[#52627a]">
                      on {formatDateTime(entry.occurredAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-white/60 px-6 py-8 text-center text-sm font-medium text-[#0D1E4C]/60">
            No activity yet.
          </p>
        )}
      </div>

      {viewingTask ? (
        <TaskViewPanel
          employees={employees}
          onClose={() => setViewingTaskId(null)}
          onReopen={onReopenTask}
          task={viewingTask}
        />
      ) : null}
    </div>
  );
}
