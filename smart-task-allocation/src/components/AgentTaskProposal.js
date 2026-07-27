"use client";

import { useState } from "react";
import { authHeaders, createProposedTasks } from "@/lib/agentClient";

// Renders inline in the chat when the agent calls the propose_tasks tool:
// select which tasks to keep, choose whether they need approval, then
// create them — mirrors the "New chat" flow's structure (pick, confirm,
// done) so it reads as one interaction instead of a form bolted onto chat.
export default function AgentTaskProposal({ taskProposal, agentName }) {
  const [selected, setSelected] = useState(() => new Set(taskProposal.tasks.map((_, index) => index)));
  const [stage, setStage] = useState("select");
  const [createdTitles, setCreatedTitles] = useState([]);
  const [error, setError] = useState("");

  function toggle(index) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleApprovalChoice(needsApproval) {
    setStage("creating");
    setError("");
    try {
      const headers = await authHeaders();
      const chosen = taskProposal.tasks.filter((_, index) => selected.has(index));
      const created = await createProposedTasks(chosen, {
        agentName,
        needsApproval,
        groupId: taskProposal.groupId,
        headers,
      });
      setCreatedTitles(created);
      setStage("done");
    } catch (err) {
      setError(err.message || "Could not create the tasks.");
      setStage("approval");
    }
  }

  const locked = stage !== "select";

  return (
    <div className="max-w-[60%] rounded-3xl bg-white/40 p-4 text-sm text-[#0D1E4C] shadow-[0_10px_30px_rgba(0,0,0,0.15)]">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#0D1E4C]/60">
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          auto_awesome
        </span>
        Recommendations
      </p>

      <div className="space-y-2">
        {taskProposal.tasks.map((task, index) => (
          <label
            key={index}
            className={`flex items-center gap-2 rounded-full border p-2.5 transition ${
              selected.has(index) ? "border-[#2563EB] bg-[#2563EB]/5" : "border-slate-200"
            } ${locked ? "pointer-events-none opacity-70" : "cursor-pointer"}`}
          >
            <input
              type="checkbox"
              checked={selected.has(index)}
              onChange={() => toggle(index)}
              disabled={locked}
            />
            <span className="min-w-0 truncate font-bold">{task.title}</span>
          </label>
        ))}
      </div>

      {stage === "select" ? (
        <button
          type="button"
          onClick={() => setStage("approval")}
          disabled={selected.size === 0}
          className="mt-3 h-9 w-full rounded-full bg-[#2563EB] text-sm font-black tracking-wide text-white transition hover:bg-[#1E40AF] disabled:opacity-40"
        >
          Create {selected.size} task{selected.size === 1 ? "" : "s"}
        </button>
      ) : null}

      {stage === "approval" ? (
        <div className="mt-3 space-y-2">
          {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleApprovalChoice(true)}
              className="h-9 flex-1 rounded-full border border-[#0D1E4C]/20 text-sm font-black tracking-wide text-[#0D1E4C] transition hover:bg-[#0D1E4C]/5"
            >
              Need approval
            </button>
            <button
              type="button"
              onClick={() => handleApprovalChoice(false)}
              className="h-9 flex-1 rounded-full bg-emerald-600 text-sm font-black tracking-wide text-white transition hover:bg-emerald-700"
            >
              Auto-approve
            </button>
          </div>
        </div>
      ) : null}

      {stage === "creating" ? <p className="mt-3 text-xs font-semibold text-[#0D1E4C]/60">Creating tasks…</p> : null}

      {stage === "done" ? (
        <p className="mt-3 text-xs font-semibold text-emerald-700">
          Created {createdTitles.length} task{createdTitles.length === 1 ? "" : "s"} in AI Recommendations.
        </p>
      ) : null}
    </div>
  );
}
