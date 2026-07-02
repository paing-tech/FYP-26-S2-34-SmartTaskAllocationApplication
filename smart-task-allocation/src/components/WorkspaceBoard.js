"use client";

// Board (Kanban) view. Sample data for now — structured to wire to real tasks
// later (each task carries its column, priority, assignees, owner + AI reason).

const PRIORITY_TONES = {
  low: { label: "LOW PRIORITY", chip: "bg-[#ecfdf5] text-[#15803d]", dot: "bg-[#22c55e]" },
  moderate: { label: "MODERATE PRIORITY", chip: "bg-[#fff7ed] text-[#b45309]", dot: "bg-[#f59e0b]" },
  urgent: { label: "URGENT PRIORITY", chip: "bg-[#fef2f2] text-[#b91c1c]", dot: "bg-[#ef4444]" },
};

const AVATAR_COLORS = ["#1E40AF", "#0F766E", "#7C3AED", "#B45309", "#BE185D"];

const COLUMNS = [
  {
    id: "todo",
    name: "To-do",
    tasks: [
      {
        id: "t1",
        priority: "low",
        category: "QA",
        title: "CRM Structure Plan",
        description: "Lorem ipsum dolor sit amet consectetur. Nibh nulla id integer non fermentum eu.",
        progress: 15,
        comments: 10,
        files: 4,
        assignees: ["Amelia Brooks", "Liam Carter", "Sophia Nguyen"],
        owner: "Optimus AI",
        reason: "Task requirement and employee skill matched",
      },
      {
        id: "t2",
        priority: "urgent",
        category: "Development",
        title: "CRM Layout Design",
        description: "Lorem ipsum dolor sit amet consectetur. Nibh nulla id integer non fermentum eu.",
        progress: 15,
        comments: 10,
        files: 4,
        assignees: ["Noah Patel", "Amelia Brooks"],
        owner: "Gabriel Tan",
        reason: "Assigned by manager based on availability",
      },
      {
        id: "t3",
        priority: "urgent",
        category: "Marketing",
        title: "CRM Layout Draft",
        description: "Lorem ipsum dolor sit amet consectetur. Nibh nulla id integer non fermentum eu.",
        progress: 15,
        comments: 10,
        files: 4,
        assignees: ["Sophia Nguyen", "Liam Carter", "Noah Patel"],
        owner: "Optimus AI",
        reason: "Balanced current workload across the team",
      },
    ],
  },
  {
    id: "progress",
    name: "In Progress",
    tasks: [
      {
        id: "t4",
        priority: "urgent",
        category: "Development",
        title: "CRM Layout Design",
        description: "Lorem ipsum dolor sit amet consectetur. Nibh nulla id integer non fermentum eu.",
        progress: 15,
        comments: 10,
        files: 4,
        assignees: ["Liam Carter", "Amelia Brooks"],
        owner: "Optimus AI",
        reason: "Task requirement and employee skill matched",
      },
      {
        id: "t5",
        priority: "low",
        category: "QA",
        title: "CRM Structure Plan",
        description: "Lorem ipsum dolor sit amet consectetur. Nibh nulla id integer non fermentum eu.",
        progress: 15,
        comments: 10,
        files: 4,
        assignees: ["Amelia Brooks"],
        owner: "Gabriel Tan",
        reason: "Assigned by manager for review",
      },
    ],
  },
  {
    id: "review",
    name: "In Review",
    tasks: [
      {
        id: "t6",
        priority: "low",
        category: "QA",
        title: "CRM Structure Plan",
        description: "Lorem ipsum dolor sit amet consectetur. Nibh nulla id integer non fermentum eu.",
        progress: 15,
        comments: 10,
        files: 4,
        assignees: ["Sophia Nguyen", "Noah Patel"],
        owner: "Optimus AI",
        reason: "Task requirement and employee skill matched",
      },
      {
        id: "t7",
        priority: "moderate",
        category: "Marketing",
        title: "CRM Layout Outline",
        description: "Lorem ipsum dolor sit amet consectetur. Nibh nulla id integer non fermentum eu.",
        progress: 15,
        comments: 10,
        files: 4,
        assignees: ["Liam Carter", "Amelia Brooks", "Noah Patel"],
        owner: "Gabriel Tan",
        reason: "Assigned by manager based on department",
      },
    ],
  },
  {
    id: "completed",
    name: "Completed",
    tasks: [
      {
        id: "t8",
        priority: "urgent",
        category: "Development",
        title: "CRM Layout Design",
        description: "Lorem ipsum dolor sit amet consectetur. Nibh nulla id integer non fermentum eu.",
        progress: 100,
        comments: 10,
        files: 4,
        assignees: ["Amelia Brooks", "Liam Carter"],
        owner: "Optimus AI",
        reason: "Task requirement and employee skill matched",
      },
      {
        id: "t9",
        priority: "urgent",
        category: "Marketing",
        title: "CRM Layout Draft",
        description: "Lorem ipsum dolor sit amet consectetur. Nibh nulla id integer non fermentum eu.",
        progress: 100,
        comments: 10,
        files: 4,
        assignees: ["Sophia Nguyen", "Noah Patel", "Liam Carter", "Amelia Brooks"],
        owner: "Gabriel Tan",
        reason: "Assigned by manager and completed",
      },
    ],
  },
];

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function Avatars({ names }) {
  return (
    <div className="flex -space-x-2">
      {names.map((name, index) => (
        <span
          key={name}
          title={name}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white"
          style={{ backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] }}
        >
          {initials(name)}
        </span>
      ))}
    </div>
  );
}

function TaskCard({ task }) {
  const tone = PRIORITY_TONES[task.priority] ?? PRIORITY_TONES.low;
  const isAi = /optimus|ai/i.test(task.owner);

  return (
    <div className="group relative pt-3">
      {/* Behind card — creator/owner; reveals the AI/manager decision on hover */}
      <div className="absolute inset-x-0 top-0 bottom-0 z-0 -translate-y-3 rounded-2xl border border-[#e6ebf2] bg-[#eef2f8] px-4 pt-2.5 shadow-sm transition-transform duration-200 ease-out group-hover:-translate-y-11">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-4 w-4 rounded-full text-center text-[9px] font-black leading-4 text-white ${
              isAi ? "bg-[#7C3AED]" : "bg-[#1E40AF]"
            }`}
          >
            {isAi ? "✦" : initials(task.owner)[0]}
          </span>
          <span className="text-[11px] font-bold text-[#0D1E4C]">{task.owner}</span>
        </div>
        <p className="mt-1 text-[11px] font-semibold leading-4 text-[#15803d] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {task.reason} ☑️
        </p>
      </div>

      {/* Front detail card */}
      <div className="relative z-10 rounded-2xl border border-[#e6ebf2] bg-white p-4 shadow-sm transition duration-200 group-hover:shadow-lg">
        {/* Tags */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide ${tone.chip}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            {tone.label}
          </span>
        </div>

        <p className="mt-3 text-xs font-semibold text-[#94a3b8]">{task.category}</p>
        <h4 className="mt-1 text-base font-black text-[#0D1E4C]">{task.title}</h4>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#667085]">{task.description}</p>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#52627a]">
            <span>Progress</span>
            <span>{task.progress}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#eef2f8]">
            <div
              className="h-full rounded-full bg-[#1E40AF]"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>

        {/* Footer: meta + assignee avatars */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] font-semibold text-[#94a3b8]">
            <span>💬 {task.comments}</span>
            <span>🔗 {task.files}</span>
          </div>
          <Avatars names={task.assignees} />
        </div>
      </div>
    </div>
  );
}

function ColumnHeader({ name, count }) {
  return (
    <div className="mb-4 flex shrink-0 items-center gap-2 px-1">
      <span className="h-4 w-4 rounded-full border-2 border-[#cbd5e1]" />
      <h3 className="text-sm font-black text-[#0D1E4C]">{name}</h3>
      <span className="rounded-full bg-[#eef2f8] px-2 py-0.5 text-xs font-bold text-[#94a3b8]">
        {count}
      </span>
      <div className="ml-auto flex items-center gap-1 text-[#94a3b8]">
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full text-base transition hover:bg-white/70"
          aria-label={`Add task to ${name}`}
        >
          +
        </button>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full text-base transition hover:bg-white/70"
          aria-label={`${name} options`}
        >
          ⋯
        </button>
      </div>
    </div>
  );
}

export default function WorkspaceBoard() {
  return (
    <div className="flex h-full min-h-0 gap-4 overflow-x-auto pb-2">
      {COLUMNS.map((column) => (
        <div key={column.id} className="flex w-80 shrink-0 flex-col">
          <ColumnHeader name={column.name} count={column.tasks.length} />

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-1 pb-4">
            {column.tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}

            <button
              type="button"
              className="w-full rounded-2xl border-2 border-dashed border-[#cbd5e1] py-3 text-sm font-bold text-[#94a3b8] transition hover:border-[#1E40AF] hover:text-[#1E40AF]"
            >
              + Add Task
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
