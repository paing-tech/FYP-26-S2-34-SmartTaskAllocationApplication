"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const AI_RECOMMENDATIONS_GROUP_NAME = "AI Recommendations";

// Matches the robot glyph used for the "Agents" nav item (SideMenuLayout.js's
// NavIcon) so the chat header/floating trigger read as the same feature.
function AgentIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
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

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

async function resolveSkillIds(skillNames, headers) {
  const ids = [];
  for (const name of skillNames) {
    const response = await fetch("/api/skills", {
      method: "POST",
      headers,
      body: JSON.stringify({ skillName: name }),
    });
    const result = await response.json();
    if (response.ok && result.skill?.skill_id) {
      ids.push(result.skill.skill_id);
    }
  }
  return ids;
}

async function createAndAllocateTasks(tasks, groupId, message) {
  const headers = await authHeaders();
  const created = [];

  for (const task of tasks) {
    const requiredSkillIds = task.requiredSkillNames.length
      ? await resolveSkillIds(task.requiredSkillNames, headers)
      : [];

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({
        groupId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        // "optimus_ai" is the only AI-authored value the task.source check
        // constraint allows today — reuse it so these tasks get the same
        // AI badge/treatment as the rest of the app's AI-created tasks.
        source: "optimus_ai",
        aiState: "active",
        reasons: { creation: [message || "Created from the AI Automation chat."], creationKind: "chat_automation" },
        requiredSkillIds,
      }),
    });
    const result = await response.json();
    if (response.ok) {
      created.push(task.title);
    }
  }

  if (created.length) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ action: "auto-allocate-tasks", enabled: true }),
    });
  }

  return created;
}

function WelcomeBanner() {
  return (
    <div className="rounded-[28px] border border-white/25 bg-gradient-to-br from-white/25 to-white/10 px-6 py-8 text-white backdrop-blur-md">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined mt-0.5 shrink-0 text-3xl" aria-hidden="true">
          auto_awesome
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-black">Prompt to Automation</p>
            <span className="rounded-full border border-white/65 bg-white/40 px-2.5 py-1 text-[10px] font-black tracking-wide text-white">
              New AI feature
            </span>
          </div>
          <p className="mt-3 max-w-xs text-left text-sm font-medium text-white/85">
            Prompt me to analyze, create, allocate or automate tasks effortlessly.
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm font-medium ${
          isUser
            ? "rounded-br-sm bg-[#0D1E4C] text-white"
            : message.tone === "error"
              ? "rounded-bl-sm border border-red-200 bg-red-50 text-red-700"
              : "rounded-bl-sm bg-slate-100 text-[#0D1E4C]"
        }`}
      >
        {message.attachmentName ? (
          <span className="mb-1 flex items-center gap-1 text-xs font-bold opacity-80">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              attach_file
            </span>
            {message.attachmentName}
          </span>
        ) : null}
        {message.content}
        {message.createdTasks?.length ? (
          <ul className="mt-2 space-y-1 border-t border-[#0D1E4C]/10 pt-2">
            {message.createdTasks.map((title) => (
              <li key={title} className="flex items-center gap-1.5 text-xs font-bold text-[#0D1E4C]">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  check
                </span>
                {title}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export default function AIAutomationChat({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [attachedFile, setAttachedFile] = useState(null);
  const [attachedText, setAttachedText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, isSending]);

  function handleAttachClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setMessages((current) => [
        ...current,
        { role: "assistant", tone: "error", content: "Please attach a .csv file." },
      ]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile(file);
      setAttachedText(String(reader.result ?? ""));
    };
    reader.readAsText(file);
  }

  function removeAttachment() {
    setAttachedFile(null);
    setAttachedText("");
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed && !attachedFile) return;

    const userMessage = { role: "user", content: trimmed || "Analyze this attachment.", attachmentName: attachedFile?.name };
    const history = messages
      .filter((entry) => entry.role === "user" || entry.role === "assistant")
      .map((entry) => ({ role: entry.role, content: entry.content }));

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setAttachedFile(null);
    setAttachedText("");
    setIsSending(true);

    try {
      const headers = await authHeaders();
      const response = await fetch("/api/agent/automation", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: userMessage.content,
          csvText: attachedText || undefined,
          csvFileName: attachedFile?.name,
          history,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "The AI assistant could not process that request.");
      }

      const tasks = Array.isArray(result.tasks) ? result.tasks : [];
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);

      if (!tasks.length) {
        return;
      }

      const created = result.groupId ? await createAndAllocateTasks(tasks, result.groupId, userMessage.content) : [];
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: created.length
            ? `Created and auto-allocated ${created.length} task${created.length === 1 ? "" : "s"} in "${AI_RECOMMENDATIONS_GROUP_NAME}" — pending your approval:`
            : "I drafted tasks but couldn't save them — please try again.",
          createdTasks: created,
        },
      ]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", tone: "error", content: error.message }]);
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-end bg-black/10 p-6" onClick={onClose}>
      <div
        className="flex h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-[32px] bg-gradient-to-b from-[#2563EB] from-0% to-white/10 to-50%  backdrop-blur-xs shadow-[0_28px_80px_rgba(0,0,0,0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/15 bg-transparent px-5 py-4">
          <div className="flex items-center gap-2.5 text-white">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
              <AgentIcon className="h-5 w-5" />
            </span>
            <p className="text-sm font-black">Optimus AI</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Optimus AI chat"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? <WelcomeBanner /> : null}
          {messages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))}
          {isSending ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-sm font-bold text-[#0D1E4C]">
                Thinking…
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-4">
          {attachedFile ? (
            <div className="mb-2 flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-[#0D1E4C]">
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                attach_file
              </span>
              <span className="min-w-0 flex-1 truncate">{attachedFile.name}</span>
              <button
                type="button"
                onClick={removeAttachment}
                aria-label="Remove attachment"
                className="text-slate-400 hover:text-slate-700"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white pl-1.5 pr-1.5">
            <button
              type="button"
              onClick={handleAttachClick}
              disabled={isSending}
              aria-label="Attach a CSV file"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                attach_file
              </span>
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />

            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              rows={1}
              placeholder="Ask me anything"
              className="min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm font-medium text-[#0D1E4C] outline-none"
            />

            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || (!input.trim() && !attachedFile)}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0D1E4C] text-white transition hover:bg-[#0a1638] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                arrow_upward
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
