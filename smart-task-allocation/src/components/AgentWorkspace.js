"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authHeaders, authHeaderOnly } from "@/lib/agentClient";
import { AGENT_AVATARS, getAgentAvatarSrc } from "@/lib/agentAvatars";
import AgentTaskProposal from "@/components/AgentTaskProposal";

const TELEGRAM_SENTINEL = "telegram";

const FEATURE_BANNERS = [
  {
    title: "Prompt to Automation",
    badge: "New AI feature",
    description: "Prompt me to analyze, create, allocate or automate tasks effortlessly.",
  },
  {
    title: "Knowledge Base",
    badge: "New",
    description: "Upload PDFs and docs so your agent can answer from your own company info.",
  },
  {
    title: "Telegram Bot",
    badge: "New",
    description: "Connect a Telegram bot to chat with your agent from your phone, anywhere.",
  },
];
const FEATURE_BANNER_INTERVAL_MS = 5000;

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-[#0D1E4C] outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20";

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 transition-transform ${open ? "" : "rotate-180"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function TelegramIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 448 512" fill="currentColor">
      <path d="M446.7 98.6l-67.6 318.8c-5.1 22.5-18.4 28.1-37.3 17.5l-103-75.9-49.7 47.8c-5.5 5.5-10.1 10.1-20.7 10.1l7.4-104.9L365.7 130c8.3-7.4-1.8-11.5-12.9-4.1L117.8 284 15.7 252.1c-22.3-7-22.7-22.3 4.6-33l394.7-152.1c18.6-6.9 35 4.1 29 32.6z" />
    </svg>
  );
}

function PinIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2a1 1 0 0 1 1 1v6.5l3.4 3.9a1 1 0 0 1-.75 1.6H13v6l-1 2-1-2v-6H6.35a1 1 0 0 1-.75-1.6L9 9.5V3a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function ThreadRow({
  thread,
  isActive,
  isRenaming,
  renameDraft,
  onSelect,
  onContextMenu,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}) {
  if (isRenaming) {
    return (
      <input
        autoFocus
        type="text"
        value={renameDraft}
        onChange={(event) => onRenameChange(event.target.value)}
        onBlur={onRenameCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") onRenameCommit();
          if (event.key === "Escape") onRenameCancel();
        }}
        className="h-10 rounded-xl border border-[#2563EB] bg-white px-3 text-sm text-[#0D1E4C] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`flex h-10 items-center gap-1.5 truncate rounded-xl px-3 text-left text-sm transition ${
        isActive ? "bg-white/70 font-semibold text-[#0D1E4C]" : "text-[#0D1E4C]/70 hover:bg-white/40"
      }`}
    >
      {thread.pinned ? <PinIcon className="h-3.5 w-3.5 shrink-0 text-[#2563EB]" /> : null}
      <span className="truncate">{thread.title}</span>
    </button>
  );
}

// Same gradient/bubble styling as AIAutomationChat.js, so the embedded Agent
// page chat and the floating Optimus AI chat read as the same product.
function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm font-medium ${
          isUser
            ? "rounded-br-sm bg-white/20 text-white"
            : message.tone === "error"
              ? "rounded-bl-sm border border-red-200 bg-red-50 text-red-700"
              : "rounded-bl-sm bg-[#2563EB]/40 text-white"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

export default function AgentWorkspace() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState(null);
  const [usage, setUsage] = useState(null);

  const [editMode, setEditMode] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [avatarKeyDraft, setAvatarKeyDraft] = useState("blue");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [createName, setCreateName] = useState("");
  const [createInstructions, setCreateInstructions] = useState("");
  const [createAvatarKey, setCreateAvatarKey] = useState("blue");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [instructionsSaved, setInstructionsSaved] = useState(false);
  const [instructionsError, setInstructionsError] = useState("");

  const [knowledgeOpen, setKnowledgeOpen] = useState(true);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");

  const [integrationsOpen, setIntegrationsOpen] = useState(true);
  const [telegram, setTelegram] = useState(null);
  const [botTokenInput, setBotTokenInput] = useState("");
  const [connectingTelegram, setConnectingTelegram] = useState(false);
  const [telegramError, setTelegramError] = useState("");

  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const [contextMenu, setContextMenu] = useState(null);
  const [renamingThreadId, setRenamingThreadId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");

  const [bannerIndex, setBannerIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setBannerIndex((current) => (current + 1) % FEATURE_BANNERS.length);
    }, FEATURE_BANNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const headers = await authHeaders();
      const res = await fetch("/api/agent", { headers });
      const data = await res.json();
      if (res.ok && data.agent) {
        setAgent(data.agent);
        setInstructionsDraft(data.agent.instructions ?? "");
        setNameDraft(data.agent.name);
        setAvatarKeyDraft(data.agent.avatar_key);
        await Promise.all([loadUsage(), loadFiles(), loadTelegram(), loadThreads()]);
      }
      setLoading(false);
    })();
  }, []);

  // Runs on every navigation, not just mount — the quick chat's expand
  // button pushes ?thread=<id> onto this same route, which doesn't remount
  // this component, so picking the param up here (keyed on searchParams)
  // is what actually makes the switch happen.
  useEffect(() => {
    const threadParam = searchParams.get("thread");
    if (threadParam) setActiveThreadId(threadParam);
  }, [searchParams]);

  useEffect(() => {
    if (!activeThreadId || activeThreadId === TELEGRAM_SENTINEL) return;
    (async () => {
      const headers = await authHeaders();
      const res = await fetch(`/api/agent/threads/${activeThreadId}/messages`, { headers });
      const data = await res.json();
      if (res.ok) setMessages(data.messages ?? []);
    })();
  }, [activeThreadId]);

  async function loadUsage() {
    const headers = await authHeaders();
    const res = await fetch("/api/agent/token-usage", { headers });
    const data = await res.json();
    if (res.ok) setUsage(data);
  }

  async function loadFiles() {
    const headers = await authHeaders();
    const res = await fetch("/api/agent/knowledge", { headers });
    const data = await res.json();
    if (res.ok) setFiles(data.files ?? []);
  }

  async function loadTelegram() {
    const headers = await authHeaders();
    const res = await fetch("/api/agent/telegram", { headers });
    const data = await res.json();
    if (res.ok) setTelegram(data.telegram);
  }

  async function loadThreads() {
    const headers = await authHeaders();
    const res = await fetch("/api/agent/threads", { headers });
    const data = await res.json();
    if (res.ok) setThreads(data.threads ?? []);
  }

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/agent", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: createName, instructions: createInstructions, avatarKey: createAvatarKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the agent.");
      setAgent(data.agent);
      setInstructionsDraft(data.agent.instructions ?? "");
      setNameDraft(data.agent.name);
      setAvatarKeyDraft(data.agent.avatar_key);
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    setProfileError("");
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/agent", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name: nameDraft, avatarKey: avatarKeyDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save changes.");
      setAgent(data.agent);
      setEditMode(false);
    } catch (error) {
      setProfileError(error.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveInstructions() {
    setSavingInstructions(true);
    setInstructionsSaved(false);
    setInstructionsError("");
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/agent", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ instructions: instructionsDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save instructions.");
      setAgent(data.agent);
      setInstructionsSaved(true);
    } catch (error) {
      setInstructionsError(error.message);
    } finally {
      setSavingInstructions(false);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setKnowledgeError("");
    try {
      const headers = await authHeaderOnly();
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/agent/knowledge", { method: "POST", headers, body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not upload the file.");
      setFiles((current) => [data.file, ...current]);
    } catch (error) {
      setKnowledgeError(error.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteFile(fileId) {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/agent/knowledge?id=${fileId}`, { method: "DELETE", headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete the file.");
      setFiles((current) => current.filter((f) => f.agent_knowledge_file_id !== fileId));
    } catch (error) {
      setKnowledgeError(error.message);
    }
  }

  async function handleConnectTelegram(event) {
    event.preventDefault();
    setConnectingTelegram(true);
    setTelegramError("");
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/agent/telegram", {
        method: "POST",
        headers,
        body: JSON.stringify({ botToken: botTokenInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not connect the bot.");
      setTelegram(data.telegram);
      setBotTokenInput("");
    } catch (error) {
      setTelegramError(error.message);
    } finally {
      setConnectingTelegram(false);
    }
  }

  async function handleDisconnectTelegram() {
    const headers = await authHeaders();
    const res = await fetch("/api/agent/telegram", { method: "DELETE", headers });
    if (res.ok) {
      setTelegram(null);
      if (activeThreadId === TELEGRAM_SENTINEL) setActiveThreadId(null);
    }
  }

  async function handleNewChat() {
    const headers = await authHeaders();
    const res = await fetch("/api/agent/threads", { method: "POST", headers });
    const data = await res.json();
    if (!res.ok) return;
    setThreads((current) => [data.thread, ...current]);
    setActiveThreadId(data.thread.agent_chat_thread_id);
    setMessages([]);
  }

  function openContextMenu(event, threadId) {
    event.preventDefault();
    setContextMenu({ threadId, x: event.clientX, y: event.clientY });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  async function handleTogglePin(thread) {
    closeContextMenu();
    const headers = await authHeaders();
    const res = await fetch(`/api/agent/threads/${thread.agent_chat_thread_id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ pinned: !thread.pinned }),
    });
    const data = await res.json();
    if (res.ok) {
      setThreads((current) =>
        current.map((t) => (t.agent_chat_thread_id === thread.agent_chat_thread_id ? data.thread : t)),
      );
    }
  }

  function startRename(thread) {
    closeContextMenu();
    setRenamingThreadId(thread.agent_chat_thread_id);
    setRenameDraft(thread.title);
  }

  function cancelRename() {
    setRenamingThreadId(null);
  }

  async function commitRename(threadId) {
    const title = renameDraft.trim();
    setRenamingThreadId(null);
    if (!title) return;
    const headers = await authHeaders();
    const res = await fetch(`/api/agent/threads/${threadId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    if (res.ok) {
      setThreads((current) => current.map((t) => (t.agent_chat_thread_id === threadId ? data.thread : t)));
    }
  }

  async function handleDeleteThread(thread) {
    closeContextMenu();
    if (!window.confirm(`Delete "${thread.title}"? This can't be undone.`)) return;
    const headers = await authHeaders();
    const res = await fetch(`/api/agent/threads/${thread.agent_chat_thread_id}`, { method: "DELETE", headers });
    if (res.ok) {
      setThreads((current) => current.filter((t) => t.agent_chat_thread_id !== thread.agent_chat_thread_id));
      if (activeThreadId === thread.agent_chat_thread_id) {
        setActiveThreadId(null);
        setMessages([]);
      }
    }
  }

  async function handleSend() {
    const trimmed = chatInput.trim();
    if (!trimmed || sendingMessage) return;

    setSendingMessage(true);
    setChatInput("");
    try {
      let threadId = activeThreadId;
      if (!threadId || threadId === TELEGRAM_SENTINEL) {
        const headers = await authHeaders();
        const res = await fetch("/api/agent/threads", { method: "POST", headers });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not start a new chat.");
        setThreads((current) => [data.thread, ...current]);
        threadId = data.thread.agent_chat_thread_id;
        setActiveThreadId(threadId);
        setMessages([]);
      }

      setMessages((current) => [...current, { role: "user", content: trimmed }]);
      const headers = await authHeaders();
      const res = await fetch(`/api/agent/threads/${threadId}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The agent could not respond.");
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.reply, taskProposal: data.taskProposal },
      ]);
      if (data.title) {
        setThreads((current) =>
          current.map((t) => (t.agent_chat_thread_id === threadId ? { ...t, title: data.title } : t)),
        );
      }
      loadUsage();
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", tone: "error", content: error.message }]);
    } finally {
      setSendingMessage(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <p className="text-sm font-semibold text-[#0D1E4C]/60">Loading your agent…</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <form
          onSubmit={handleCreate}
          className="w-full max-w-md space-y-5 rounded-[28px] border border-white/60 bg-white/25 p-8 backdrop-blur-sm"
        >
          <div className="text-center">
            <h2 className="mt-4 text-lg font-bold text-[#0D1E4C]">Create your agent</h2>
            <Image
              src={getAgentAvatarSrc(createAvatarKey)}
              alt=""
              width={96}
              height={96}
              className="mx-auto mt-2 rounded-2xl"
            />
            <div className="mt-3 flex justify-center gap-2">
              {AGENT_AVATARS.map((avatar) => (
                <button
                  key={avatar.key}
                  type="button"
                  onClick={() => setCreateAvatarKey(avatar.key)}
                  className={`overflow-hidden rounded-xl border-2 transition ${
                    createAvatarKey === avatar.key ? "border-[#2563EB]" : "border-transparent hover:border-white"
                  }`}
                >
                  <Image src={avatar.src} alt={avatar.key} width={40} height={40} />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="agentName" className="block text-sm font-bold text-[#0D1E4C]">
              Agent name
            </label>
            <input
              id="agentName"
              type="text"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Name your agent"
              required
              className={`${inputClass}`}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="agentInstructions" className="block text-sm font-bold text-[#0D1E4C]">
              Instructions <span className="font-medium text-slate-400">(optional)</span>
            </label>
            <textarea
              id="agentInstructions"
              value={createInstructions}
              onChange={(event) => setCreateInstructions(event.target.value)}
              rows={4}
              className={`${inputClass}`}
            />
          </div>
          {createError ? <p className="text-sm font-medium text-red-600">{createError}</p> : null}
          <button
            type="submit"
            disabled={creating}
            className="h-12 w-full rounded-full bg-[#0D1E4C] text-sm font-black uppercase tracking-[0.2em] text-white transition hover:scale-105 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Agent"}
          </button>
        </form>
      </div>
    );
  }

  const activeMenuThread = contextMenu ? threads.find((t) => t.agent_chat_thread_id === contextMenu.threadId) : null;

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* Left: profile card */}
      <aside className="hidden w-64 shrink-0 flex-col gap-6 overflow-y-auto rounded-[28px] border border-white/60 bg-white/25 p-6 backdrop-blur-sm lg:flex">
        <div className="text-center">
          <div className="relative mx-auto w-fit">
            <Image
              src={getAgentAvatarSrc(editMode ? avatarKeyDraft : agent.avatar_key)}
              alt={agent.name}
              width={120}
              height={120}
              className="rounded-2xl"
            />
            <button
              type="button"
              onClick={() => setEditMode((current) => !current)}
              aria-label={editMode ? "Cancel editing" : "Edit agent"}
              className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-white text-[#0D1E4C] shadow-sm transition hover:scale-105"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {editMode ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />}
              </svg>
            </button>
          </div>

          {editMode ? (
            <div className="mt-4 space-y-4">
              <input
                type="text"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                className={`${inputClass} text-center font-bold`}
              />
              <div className="flex justify-center gap-2">
                {AGENT_AVATARS.map((avatar) => (
                  <button
                    key={avatar.key}
                    type="button"
                    onClick={() => setAvatarKeyDraft(avatar.key)}
                    className={`overflow-hidden rounded-xl border-2 transition ${
                      avatarKeyDraft === avatar.key ? "border-[#2563EB]" : "border-transparent hover:border-white"
                    }`}
                  >
                    <Image src={avatar.src} alt={avatar.key} width={44} height={44} />
                  </button>
                ))}
              </div>
              {profileError ? <p className="text-xs font-medium text-red-600">{profileError}</p> : null}
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="h-10 w-full rounded-full bg-[#0D1E4C] text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#0a1838] disabled:opacity-50"
              >
                {savingProfile ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <h1 className="mt-4 text-xl font-black text-[#0D1E4C]">{agent.name}</h1>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-bold text-[#0D1E4C]">Instructions</h2>
          <textarea
            value={instructionsDraft}
            onChange={(event) => {
              setInstructionsDraft(event.target.value);
              setInstructionsSaved(false);
            }}
            rows={6}
            className={inputClass}
          />
          {instructionsError ? <p className="text-xs font-medium text-red-600">{instructionsError}</p> : null}
          {instructionsDraft !== agent.instructions ? (
            <button
              type="button"
              onClick={handleSaveInstructions}
              disabled={savingInstructions}
              className="h-9 w-full rounded-full bg-[#0D1E4C] text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#0a1838] disabled:opacity-50"
            >
              {savingInstructions ? "Saving…" : "Save instructions"}
            </button>
          ) : instructionsSaved ? (
            <p className="text-xs font-medium text-emerald-600">Saved.</p>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-white/40 pt-4">
          <button
            type="button"
            onClick={() => setKnowledgeOpen((current) => !current)}
            className="flex w-full items-center justify-between text-sm font-bold text-[#0D1E4C]"
          >
            Knowledge
            <ChevronIcon open={knowledgeOpen} />
          </button>
          {knowledgeOpen ? (
            <div className="space-y-2 pt-1">
              {files.map((file) => (
                <div
                  key={file.agent_knowledge_file_id}
                  className="flex items-center justify-between rounded-xl border border-white/40 bg-white/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-[#0D1E4C]">{file.filename}</p>
                    <p className="text-[10px] text-[#0D1E4C]/60">{formatBytes(file.file_size_bytes)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteFile(file.agent_knowledge_file_id)}
                    aria-label="Remove file"
                    className="shrink-0 text-red-500 hover:text-red-700"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <label className="flex h-9 cursor-pointer items-center justify-center rounded-full border border-dashed border-[#0D1E4C]/30 text-xs font-bold text-[#0D1E4C]/70 transition hover:border-[#2563EB] hover:text-[#2563EB]">
                {uploading ? "Uploading…" : "+ Add file"}
                <input type="file" accept=".pdf,.doc,.docx,.txt,.md" className="hidden" disabled={uploading} onChange={handleUpload} />
              </label>
              {knowledgeError ? <p className="text-xs font-medium text-red-600">{knowledgeError}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-white/40 pt-4">
          <button
            type="button"
            onClick={() => setIntegrationsOpen((current) => !current)}
            className="flex w-full items-center justify-between text-sm font-bold text-[#0D1E4C]"
          >
            Integrations
            <ChevronIcon open={integrationsOpen} />
          </button>
          {integrationsOpen ? (
            <div className="space-y-3 pt-1">
              <div className="relative flex flex-col items-center gap-2 rounded-2xl border border-white/40 bg-white/40 p-4">
                <span className="group absolute right-4 top-4 flex h-2 w-2 cursor-help items-center justify-center rounded-full text-[#0D1E4C]/50 hover:text-[#0D1E4C]">
                  <span className="material-symbols-outlined text-xs" aria-hidden="true">
                    help
                  </span>
                  <span className="pointer-events-none absolute -right-6 top-5 z-10 hidden w-56 rounded-xl border border-white/65 bg-white/40 backdrop-blur-md p-3 text-left text-[10px] font-medium leading-relaxed text-[#0D1E4C] shadow-[0_16px_40px_rgba(0,0,0,0.2)] group-hover:block">
                    <strong className="block text-xs font-bold">Setting up a Telegram bot</strong>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                      <li>Open Telegram and message @BotFather</li>
                      <li>
                        Send <code>/newbot</code> and follow the prompts
                      </li>
                      <li>Copy the token it gives you</li>
                      <li>Paste it below and hit Connect</li>
                    </ol>
                  </span>
                </span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#26A5E4] text-white">
                  <TelegramIcon className="h-4 w-4" />
                </span>
                <span className="text-xs font-bold text-[#0D1E4C]">Telegram</span>
                {telegram ? (
                  <>
                    <p className="text-[11px] text-[#0D1E4C]/60">Connected as @{telegram.bot_username}</p>
                    <button
                      type="button"
                      onClick={handleDisconnectTelegram}
                      className="text-[11px] font-bold text-red-500 hover:text-red-700"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleConnectTelegram} className="w-full space-y-2">
                    <input
                      type="text"
                      value={botTokenInput}
                      onChange={(event) => setBotTokenInput(event.target.value)}
                      placeholder="Bot token from @BotFather"
                      required
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-[#0D1E4C] outline-none focus:border-[#2563EB]"
                    />
                    <button
                      type="submit"
                      disabled={connectingTelegram}
                      className="h-8 w-full rounded-full bg-[#26A5E4] text-[11px] font-black uppercase tracking-wide text-white transition hover:bg-[#1e8fc9] disabled:opacity-50"
                    >
                      {connectingTelegram ? "Connecting…" : "Connect"}
                    </button>
                    {telegramError ? <p className="text-[11px] font-medium text-red-600">{telegramError}</p> : null}
                  </form>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col gap-4">
        {/* Top: token usage (matches Recents width) + rotating feature banner (matches chat panel width) */}
        <div className="flex items-stretch gap-4">
          <div className="flex w-80 shrink-0 flex-col justify-center gap-1.5 rounded-[28px] border border-white/60 bg-white/25 px-5 py-3 backdrop-blur-sm">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#0D1E4C]/70">Tokens Usage</h2>
            <p className="text-center text-xs font-bold text-[#0D1E4C]">
              {(usage?.today ?? 0).toLocaleString()} / {(usage?.dailyLimit ?? 0).toLocaleString()}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/50">
              <div
                className={`h-full rounded-full transition-all ${
                  (usage?.dailyPercent ?? 0) >= 90 ? "bg-red-500" : (usage?.dailyPercent ?? 0) >= 70 ? "bg-amber-500" : "bg-[#2563EB]"
                }`}
                style={{ width: `${usage?.dailyPercent ?? 0}%` }}
              />
            </div>
            <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-[#0D1E4C]/50">
              Daily limit
            </p>
            <div className="mt-1 flex items-center justify-between border-t border-white/40 pt-1.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0D1E4C]/50">This week</p>
                <p className="text-base font-black text-[#0D1E4C]">{(usage?.thisWeek ?? 0).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0D1E4C]/50">All time</p>
                <p className="text-base font-black text-[#0D1E4C]">{(usage?.allTime ?? 0).toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-1 items-center gap-3 overflow-hidden rounded-[28px] border border-white/60 bg-gradient-to-br from-[#2563EB]/15 to-white/10 px-6 py-3 backdrop-blur-sm">
            <span className="material-symbols-outlined shrink-0 text-2xl text-[#2563EB]" aria-hidden="true">
              auto_awesome
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-black text-[#0D1E4C]">{FEATURE_BANNERS[bannerIndex].title}</p>
                <span className="shrink-0 rounded-full border border-[#2563EB]/30 bg-[#2563EB]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#2563EB]">
                  {FEATURE_BANNERS[bannerIndex].badge}
                </span>
              </div>
              <p className="truncate text-xs font-medium text-[#0D1E4C]/70">{FEATURE_BANNERS[bannerIndex].description}</p>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          {/* Middle: chat sessions */}
          <aside className="hidden w-80 shrink-0 flex-col gap-1 overflow-y-auto rounded-[28px] border border-white/60 bg-white/25 p-4 backdrop-blur-sm md:flex">
            <button
              type="button"
              onClick={handleNewChat}
              className="mb-2 flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[#0D1E4C] transition hover:bg-white/40"
            >
              + New chat
            </button>

            {telegram ? (
              <button
                type="button"
                onClick={() => setActiveThreadId(TELEGRAM_SENTINEL)}
                className={`flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${
                  activeThreadId === TELEGRAM_SENTINEL ? "bg-white/70 text-[#0D1E4C]" : "text-[#0D1E4C]/80 hover:bg-white/40"
                }`}
              >
                <TelegramIcon className="h-4 w-4 text-[#26A5E4]" />
                Telegram bot
              </button>
            ) : null}

            {threads.some((thread) => thread.pinned) ? (
              <>
                <p className="mt-3 px-3 text-xs font-bold uppercase tracking-wide text-[#0D1E4C]/50">Pinned</p>
                {threads
                  .filter((thread) => thread.pinned)
                  .map((thread) => (
                    <ThreadRow
                      key={thread.agent_chat_thread_id}
                      thread={thread}
                      isActive={activeThreadId === thread.agent_chat_thread_id}
                      isRenaming={renamingThreadId === thread.agent_chat_thread_id}
                      renameDraft={renameDraft}
                      onSelect={() => setActiveThreadId(thread.agent_chat_thread_id)}
                      onContextMenu={(event) => openContextMenu(event, thread.agent_chat_thread_id)}
                      onRenameChange={setRenameDraft}
                      onRenameCommit={() => commitRename(thread.agent_chat_thread_id)}
                      onRenameCancel={cancelRename}
                    />
                  ))}
              </>
            ) : null}

            <p className="mt-3 px-3 text-xs font-bold uppercase tracking-wide text-[#0D1E4C]/50">Recents</p>
            {threads
              .filter((thread) => !thread.pinned)
              .map((thread) => (
                <ThreadRow
                  key={thread.agent_chat_thread_id}
                  thread={thread}
                  isActive={activeThreadId === thread.agent_chat_thread_id}
                  isRenaming={renamingThreadId === thread.agent_chat_thread_id}
                  renameDraft={renameDraft}
                  onSelect={() => setActiveThreadId(thread.agent_chat_thread_id)}
                  onContextMenu={(event) => openContextMenu(event, thread.agent_chat_thread_id)}
                  onRenameChange={setRenameDraft}
                  onRenameCommit={() => commitRename(thread.agent_chat_thread_id)}
                  onRenameCancel={cancelRename}
                />
              ))}
          </aside>

          {/* Right: chat panel — same look as AIAutomationChat.js */}
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-gradient-to-b from-[#2563EB] from-0% to-white/10 to-50% backdrop-blur-xs">
            <div className="flex items-center gap-2.5 border-b border-white/15 px-5 py-4 text-white">
              <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/15">
                <Image src={getAgentAvatarSrc(agent.avatar_key)} alt="" fill className="object-cover" />
              </span>
              <p className="text-sm font-black">{agent.name}</p>
            </div>

            {activeThreadId === TELEGRAM_SENTINEL ? (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-white">
                {telegram ? (
                  <p className="text-sm font-medium">
                    Connected as <strong>@{telegram.bot_username}</strong>. Message the bot on Telegram to chat with{" "}
                    {agent.name} from your phone.
                  </p>
                ) : (
                  <p className="text-sm font-medium">Connect Telegram from the Integrations panel first.</p>
                )}
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {messages.length === 0 ? (
                    <p className="text-sm font-medium text-white/70">Ask {agent.name} anything to get started.</p>
                  ) : (
                    messages.map((message, index) => (
                      <div key={index} className="space-y-2">
                        {message.content ? <MessageBubble message={message} /> : null}
                        {message.taskProposal ? (
                          <AgentTaskProposal taskProposal={message.taskProposal} agentName={agent.name} />
                        ) : null}
                      </div>
                    ))
                  )}
                  {sendingMessage ? (
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-sm bg-[#2563EB]/40 px-4 py-2 text-sm font-bold text-white">…</div>
                    </div>
                  ) : null}
                </div>

                <div className="p-4">
                  <div className="flex items-center gap-1 rounded-full border border-white/40 bg-white/10 pl-4 pr-1.5">
                    <textarea
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={sendingMessage}
                      rows={1}
                      placeholder="Ask me anything"
                      className="min-h-9 flex-1 resize-none bg-transparent py-4 text-sm font-medium text-[#0D1E4C] outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={sendingMessage || !chatInput.trim()}
                      aria-label="Send"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-500 text-white transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </section>

      {contextMenu && activeMenuThread ? (
        <div
          className="fixed inset-0 z-[80]"
          onClick={closeContextMenu}
          onContextMenu={(event) => {
            event.preventDefault();
            closeContextMenu();
          }}
        >
          <div
            className="absolute w-40 overflow-hidden rounded-2xl border border-white/60 bg-white py-1 shadow-[0_20px_50px_rgba(0,0,0,0.25)]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleTogglePin(activeMenuThread)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-[#0D1E4C] hover:bg-slate-100"
            >
              <PinIcon className="h-3.5 w-3.5" />
              {activeMenuThread.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              type="button"
              onClick={() => startRename(activeMenuThread)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-[#0D1E4C] hover:bg-slate-100"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => handleDeleteThread(activeMenuThread)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
