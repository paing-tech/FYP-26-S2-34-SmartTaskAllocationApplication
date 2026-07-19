"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const METHODOLOGIES = [
  { value: "general", label: "General purpose (any team)" },
  { value: "scrum", label: "Scrum (weekly sprints)" },
  { value: "kanban", label: "Kanban (board columns)" },
  { value: "waterfall", label: "Waterfall (phases)" },
];

function isEmployeeRole(roleName) {
  return (roleName || "").trim().toLowerCase() === "employee";
}

const STEPS = [
  { label: "Investigating organization structure", icon: "org" },
  { label: "Choosing suitable employees", icon: "users" },
  { label: "Creating a workspace", icon: "workspace" },
  { label: "Adding required tasks", icon: "tasks" },
  { label: "Assigning tasks to suitable employees", icon: "assign" },
  { label: "Completion", icon: "done" },
];

const STEP_MS = 5000;
const COLS = 4;

const inputClass =
  "h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-[#0D1E4C] outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20";

function Spinner({ className = "h-4 w-4" }) {
  return (
    <svg className={`${className} animate-spin text-[#60A5FA]`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

function StepIcon({ name }) {
  const p = {
    className: "h-6 w-6",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  if (name === "org")
    return (
      <svg {...p}>
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6" />
      </svg>
    );
  if (name === "users")
    return (
      <svg {...p}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    );
  if (name === "workspace")
    return (
      <svg {...p}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  if (name === "tasks")
    return (
      <svg {...p}>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  if (name === "assign")
    return (
      <svg {...p}>
        <path d="M3 7h13M3 7l3-3M3 7l3 3" />
        <path d="M21 17H8M21 17l-3-3M21 17l-3 3" />
      </svg>
    );
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

// status: "done" | "active" | "pending"
function Node({ step, status }) {
  const tile =
    status === "done"
      ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
      : status === "active"
        ? "border-[#2563EB] bg-[#2563EB]/25 text-white shadow-[0_0_26px_rgba(37,99,235,0.55)] animate-pulse"
        : "border-white/10 bg-white/[0.04] text-white/35";

  return (
    <div className="flex w-24 shrink-0 flex-col items-center gap-2">
      <div className={`relative flex h-16 w-16 items-center justify-center rounded-2xl border transition ${tile}`}>
        <StepIcon name={step.icon} />
        {status === "active" ? (
          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[#0b1020] p-0.5">
            <Spinner />
          </span>
        ) : null}
        {status === "done" ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#0b1020]">
            <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        ) : null}
      </div>
      <span
        className={`text-center text-[11px] font-semibold leading-tight ${
          status === "pending" ? "text-white/35" : "text-white/80"
        }`}
      >
        {step.label}
      </span>
    </div>
  );
}

function edgeClass(state) {
  if (state === "done") return "bg-emerald-400/70";
  if (state === "active") return "bg-[#2563EB] animate-pulse";
  return "bg-white/10";
}

function StatusBadge({ status }) {
  if (status === "active") {
    return (
      <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[#0b1020] p-0.5">
        <Spinner />
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#0b1020]">
        <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    );
  }
  return null;
}

// Circular agent avatar node (used by the Orchestrator / Optimus Blue flow).
function AgentAvatarNode({ agent, status }) {
  const ring =
    status === "done"
      ? "ring-emerald-400"
      : status === "active"
        ? "ring-[#2563EB] shadow-[0_0_26px_rgba(37,99,235,0.6)] animate-pulse"
        : "ring-white/10";

  return (
    <div className="flex w-24 flex-col items-center gap-2">
      <div
        className={`relative h-16 w-16 overflow-hidden rounded-full bg-white/10 ring-2 ${ring} ${
          status === "pending" ? "opacity-40" : ""
        }`}
      >
        <Image src={agent.image} alt={agent.name} fill sizes="64px" className="object-cover object-top" />
        <StatusBadge status={status} />
      </div>
      <span
        className={`text-center text-[11px] font-bold leading-tight ${
          status === "pending" ? "text-white/35" : "text-white/85"
        }`}
      >
        {agent.name}
      </span>
    </div>
  );
}

export default function AgentDeployModal({ agent, roster = [], onClose }) {
  // Blue (Orchestrator) skips the project form and assembles agents right away.
  const [phase, setPhase] = useState(agent.id === "blue" ? "running" : "form"); // "form" | "running"
  const [projectName, setProjectName] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [duration, setDuration] = useState("");
  const [methodology, setMethodology] = useState("general");
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const startedRef = useRef(false);

  // Optimus Blue (Orchestrator) assembles the other agents instead of running
  // the linear team-build pipeline.
  const isBlue = agent.id === "blue";
  const isRed = agent.id === "red";
  const otherAgents = isBlue ? roster.filter((a) => a.id !== agent.id) : [];

  const lastIndex = isBlue ? otherAgents.length + 1 : STEPS.length - 1;
  const isFinished = phase === "running" && currentStep >= lastIndex;

  // Simulated pipeline (Blue / fallback). Red runs the real workflow below.
  useEffect(() => {
    if (phase !== "running" || isRed || currentStep >= lastIndex) return;
    const timer = setTimeout(() => setCurrentStep((step) => step + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [phase, currentStep, lastIndex, isRed]);

  // Real team-build workflow for Optima Red — runs once when deploying starts.
  useEffect(() => {
    if (phase === "running" && isRed && !startedRef.current) {
      startedRef.current = true;
      runWorkflow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isRed]);

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  async function runWorkflow() {
    setError("");
    try {
      const headers = await authHeaders();
      const size = Math.max(1, Number(teamSize) || 1);
      const base = projectName.trim() || "New Project";

      // 0 — Investigating organization structure
      setCurrentStep(0);
      const orgRes = await fetch("/api/manager-organization", { headers });
      const orgData = await orgRes.json();
      if (!orgRes.ok) throw new Error(orgData.error || "Could not read your organization.");

      // 1 — Choosing suitable employees (Active + Employee role only)
      setCurrentStep(1);
      const chosen = (orgData.accounts ?? [])
        .filter(
          (a) =>
            a.account_status === "Active" &&
            a.user_id !== orgData.currentUserId &&
            isEmployeeRole(a.role?.role_name),
        )
        .slice(0, size);

      // 2 — Creating a workspace
      setCurrentStep(2);
      const wsRes = await fetch("/api/workspaces", {
        method: "POST",
        headers,
        body: JSON.stringify({ workspaceName: base }),
      });
      const wsData = await wsRes.json();
      if (!wsRes.ok) throw new Error(wsData.error || "Could not create the workspace.");
      const workspaceId = wsData.workspace?.workspace_id;

      // 3 — Adding required tasks (AI-generated plan → groups + tasks)
      setCurrentStep(3);
      const planRes = await fetch("/api/agent/generate-plan", {
        method: "POST",
        headers,
        body: JSON.stringify({ projectName: base, duration, methodology }),
      });
      const planData = await planRes.json();
      const groups = planData.groups ?? [];
      let taskCount = 0;
      for (const group of groups) {
        const groupRes = await fetch("/api/task-groups", {
          method: "POST",
          headers,
          body: JSON.stringify({ workspaceId, groupName: group.name }),
        });
        const groupData = await groupRes.json();
        const groupId = groupData.group?.group_id ?? null;
        for (const task of group.tasks ?? []) {
          const title = typeof task === "string" ? task : task.title;
          if (!title) continue;
          await fetch("/api/tasks", {
            method: "POST",
            headers,
            body: JSON.stringify({ workspaceId, groupId, title }),
          });
          taskCount += 1;
        }
      }

      // 4 — Assigning tasks to suitable employees (round-robin, keeps group)
      setCurrentStep(4);
      if (chosen.length) {
        const tasksRes = await fetch(`/api/tasks?workspaceId=${workspaceId}`, { headers });
        const tasksData = await tasksRes.json();
        const tasks = tasksData.tasks ?? [];
        for (let i = 0; i < tasks.length; i += 1) {
          const task = tasks[i];
          const assignee = chosen[i % chosen.length];
          await fetch("/api/tasks", {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              taskId: task.task_id,
              title: task.title,
              description: task.description ?? "",
              status: task.status ?? "Open",
              priority: task.priority ?? "Medium",
              assignedTo: assignee.user_id,
              assignedBy: "Optimus AI",
              startDatetime: task.start_datetime ?? "",
              endDatetime: task.end_datetime ?? "",
            }),
          });
        }
      }

      // 5 — Completion
      setCurrentStep(5);
      setSummary({
        members: chosen.length,
        workspace: base,
        tasks: taskCount,
      });
    } catch (runError) {
      setError(runError.message);
    }
  }

  function handleStart(event) {
    event.preventDefault();
    setCurrentStep(0);
    setError("");
    setSummary(null);
    setPhase("running");
  }

  function statusOf(index) {
    if (index < currentStep) return "done";
    if (index === currentStep) return index === lastIndex ? "done" : "active";
    return "pending";
  }

  // Edge between node a and its successor b=a+1.
  function edgeState(higherIndex) {
    if (currentStep > higherIndex) return "done";
    if (currentStep === higherIndex) return "active";
    return "pending";
  }

  // Snake layout: row 0 left→right, row 1 right→left.
  const rows = [];
  for (let r = 0; r * COLS < STEPS.length; r += 1) {
    const start = r * COLS;
    const indices = [];
    for (let c = 0; c < COLS && start + c < STEPS.length; c += 1) {
      indices.push(start + c);
    }
    rows.push(r % 2 === 1 ? indices.reverse() : indices);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`max-h-[88vh] w-full overflow-y-auto rounded-[28px] bg-white p-8 shadow-[0_28px_80px_rgba(0,0,0,0.35)] ${
          phase === "form" ? "max-w-xl" : "max-w-3xl"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-[#0D1E4C]">Deploy {agent.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{agent.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {phase === "form" ? (
          <form onSubmit={handleStart} className="mt-6 space-y-5">
            <div className="space-y-2">
              <label htmlFor="projectName" className="block text-sm font-bold text-[#0D1E4C]">
                Project name
              </label>
              <input
                id="projectName"
                type="text"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="e.g. Apollo Launch"
                required
                autoFocus
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="teamSize" className="block text-sm font-bold text-[#0D1E4C]">
                  Group size
                </label>
                <input
                  id="teamSize"
                  type="number"
                  min={1}
                  value={teamSize}
                  onChange={(event) => setTeamSize(event.target.value)}
                  placeholder="e.g. 5"
                  required
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="duration" className="block text-sm font-bold text-[#0D1E4C]">
                  Duration
                </label>
                <input
                  id="duration"
                  type="text"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  placeholder="e.g. 3 weeks"
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="methodology" className="block text-sm font-bold text-[#0D1E4C]">
                Methodology <span className="font-medium text-slate-400">(optional)</span>
              </label>
              <select
                id="methodology"
                value={methodology}
                onChange={(event) => setMethodology(event.target.value)}
                className={inputClass}
              >
                {METHODOLOGIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="mt-2 h-12 w-full rounded-full bg-[#0D1E4C] text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#0a1838]"
            >
              Lock In
            </button>
          </form>
        ) : (
          <div className="mt-6">
            <div className="mb-4 flex flex-wrap gap-2 text-xs">
              {projectName ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-[#0D1E4C]">{projectName}</span>
              ) : null}
              {teamSize ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-[#0D1E4C]">{teamSize} members</span>
              ) : null}
              {duration ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-[#0D1E4C]">{duration}</span>
              ) : null}
            </div>

            {/* Automation flow canvas */}
            <div className="rounded-2xl border border-white/10 bg-[#0b1020] bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:18px_18px] p-6">
              {isBlue ? (
                <div className="flex flex-col items-center">
                  {/* Source: Assembling agents */}
                  <div className="flex w-32 flex-col items-center gap-2">
                    <div
                      className={`relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border ${
                        currentStep === 0
                          ? "border-[#2563EB] shadow-[0_0_26px_rgba(37,99,235,0.55)] animate-pulse"
                          : "border-emerald-400/60"
                      }`}
                    >
                      <Image src={agent.image} alt={agent.name} fill sizes="80px" className="object-cover object-top" />
                      <StatusBadge status={currentStep === 0 ? "active" : "done"} />
                    </div>
                    <span className="text-center text-xs font-bold text-white/85">Assembling agents</span>
                  </div>

                  {/* stem from source */}
                  <div
                    className={`h-6 w-[3px] rounded-full ${edgeClass(
                      currentStep === 0 ? "pending" : isFinished ? "done" : "active",
                    )}`}
                  />

                  {/* distributor bus + agent avatars */}
                  <div className="flex flex-col items-stretch">
                    <div
                      className={`mx-auto h-[3px] w-[78%] rounded-full ${edgeClass(
                        currentStep === 0 ? "pending" : isFinished ? "done" : "active",
                      )}`}
                    />
                    <div className="flex justify-center gap-6 sm:gap-12">
                      {otherAgents.map((a, j) => {
                        const flowIndex = j + 1;
                        const st =
                          currentStep > flowIndex ? "done" : currentStep === flowIndex ? "active" : "pending";
                        return (
                          <div key={a.id} className="flex flex-col items-center">
                            <div className={`h-6 w-[3px] rounded-full ${edgeClass(st)}`} />
                            <AgentAvatarNode agent={a} status={st} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                rows.map((indices, rowNumber) => {
                  const isReversed = rowNumber % 2 === 1;
                  return (
                    <div key={rowNumber}>
                      <div className="flex items-start">
                        {indices.map((idx, position) => {
                          // The connector that follows this node in flow order.
                          const flowHigher = isReversed ? idx : idx + 1;
                          const showEdge = position < indices.length - 1;
                          return (
                            <div key={idx} className="flex items-start">
                              <Node step={STEPS[idx]} status={statusOf(idx)} />
                              {showEdge ? (
                                <div className={`mt-8 h-[3px] w-10 rounded-full sm:w-16 ${edgeClass(edgeState(flowHigher))}`} />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>

                      {/* vertical connector to the next row, aligned under the last flow node */}
                      {rowNumber < rows.length - 1 ? (
                        <div className={`flex ${isReversed ? "justify-start" : "justify-end"}`}>
                          <div className="flex w-24 justify-center">
                            <div className={`my-1 h-8 w-[3px] rounded-full ${edgeClass(edgeState((rowNumber + 1) * COLS))}`} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            {error ? (
              <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}

            {summary ? (
              <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Deployed workspace <strong>{summary.workspace}</strong> with {summary.members} member
                {summary.members === 1 ? "" : "s"} and {summary.tasks} tasks assigned.
              </p>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              disabled={!isFinished && !error}
              className="mt-6 h-12 w-full rounded-full bg-[#0D1E4C] text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#0a1838] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {error ? "Close" : isFinished ? "Done" : "Deploying..."}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
