"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authHeaders } from "@/lib/agentClient";
import { getAgentAvatarSrc, getAgentAvatarColor } from "@/lib/agentAvatars";
import AgentTaskProposal from "@/components/AgentTaskProposal";

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

// The "quick chat" trigger from the side nav — same agent/threads backend as
// the full Agent page, just a lighter surface. The thread isn't created
// until the first message is actually sent, so opening-then-closing without
// typing anything doesn't litter the Agent page's Recents list.
export default function AIAutomationChat({ actor, onClose }) {
  const router = useRouter();
  const [agent, setAgent] = useState(null);
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [threadId, setThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, isSending]);

  useEffect(() => {
    (async () => {
      setLoadingAgent(true);
      const headers = await authHeaders();
      const agentRes = await fetch("/api/agent", { headers });
      const agentData = await agentRes.json();
      if (agentRes.ok && agentData.agent) {
        setAgent(agentData.agent);
      }
      setLoadingAgent(false);
    })();
  }, []);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isSending || !agent) return;

    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setInput("");
    setIsSending(true);

    try {
      const headers = await authHeaders();
      let currentThreadId = threadId;
      if (!currentThreadId) {
        const threadRes = await fetch("/api/agent/threads", { method: "POST", headers });
        const threadData = await threadRes.json();
        if (!threadRes.ok) throw new Error(threadData.error || "Could not start a chat.");
        currentThreadId = threadData.thread.agent_chat_thread_id;
        setThreadId(currentThreadId);
      }

      const response = await fetch(`/api/agent/threads/${currentThreadId}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: trimmed }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "The agent could not respond.");
      }
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.reply, taskProposal: result.taskProposal },
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

  function goToAgentPage() {
    const base = `/${actor}/agents`;
    router.push(threadId ? `${base}?thread=${threadId}` : base);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-end bg-black/10 pb-6 pr-2" onClick={onClose}>
      <div
        className="flex h-[68vh] w-full max-w-lg flex-col overflow-hidden rounded-[32px] backdrop-blur-xs shadow-[0_28px_80px_rgba(0,0,0,0.35)]"
        style={{
          background: `linear-gradient(to bottom, ${getAgentAvatarColor(agent?.avatar_key)} 0%, rgba(255,255,255,0.1) 60%)`,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/15 bg-transparent px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5 text-white">
            <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/15">
              {agent ? (
                <Image src={getAgentAvatarSrc(agent.avatar_key)} alt="" fill className="object-cover" />
              ) : null}
            </span>
            <p className="truncate text-sm font-black">{agent?.name ?? "Your agent"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={goToAgentPage}
              aria-label="Expand to full chat"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                expand_content
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chat"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                close
              </span>
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {loadingAgent ? (
            <p className="text-sm font-medium text-white/70">Loading…</p>
          ) : !agent ? (
            <div className="rounded-[28px] border border-white/25 bg-white/10 px-6 py-8 text-center text-white">
              <p className="text-sm font-bold">You haven&apos;t created an agent yet.</p>
              <button
                type="button"
                onClick={goToAgentPage}
                className="mt-4 rounded-full bg-white px-6 py-2.5 text-xs font-black uppercase tracking-wide text-[#0D1E4C]"
              >
                Create your agent
              </button>
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm font-medium text-white/70">Ask {agent.name} anything to get started.</p>
          ) : (
            messages.map((message, index) => (
              <div key={index} className="space-y-2">
                {message.content ? <MessageBubble message={message} /> : null}
                {message.taskProposal ? (
                  <AgentTaskProposal
                    taskProposal={message.taskProposal}
                    agentName={agent.name}
                    threadId={threadId}
                    messageIndex={index}
                  />
                ) : null}
              </div>
            ))
          )}
          {isSending ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-[#2563EB]/40 px-4 py-2 text-sm font-bold text-white">…</div>
            </div>
          ) : null}
        </div>

        <div className="p-4">
          <div className="flex items-center gap-1 rounded-full border border-white/40 bg-white/10 pl-4 pr-1.5">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending || !agent}
              rows={1}
              placeholder="Ask me anything"
              className="min-h-9 flex-1 resize-none bg-transparent py-4 text-sm font-medium text-[#0D1E4C] outline-none"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || !input.trim() || !agent}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-500 text-white transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
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
