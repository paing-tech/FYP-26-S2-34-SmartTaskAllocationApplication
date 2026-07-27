// Thin REST wrapper around Azure AI Foundry's Agent Service (Assistants-API
// shape: assistants/threads/files/vector_stores). API_VERSION is the one
// place to update if your Foundry project reports a different version in
// its quickstart/"View code" panel.
const API_VERSION = "2025-05-01-preview";

export function isFoundryConfigured() {
  return Boolean(
    process.env.AZURE_AI_FOUNDRY_ENDPOINT &&
      process.env.AZURE_AI_FOUNDRY_API_KEY &&
      process.env.AZURE_AI_FOUNDRY_MODEL_DEPLOYMENT,
  );
}

export function getFoundryConfig() {
  const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT;
  const apiKey = process.env.AZURE_AI_FOUNDRY_API_KEY;
  const deployment = process.env.AZURE_AI_FOUNDRY_MODEL_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    throw new Error(
      "Missing Azure AI Foundry environment variables. Set AZURE_AI_FOUNDRY_ENDPOINT, AZURE_AI_FOUNDRY_API_KEY, and AZURE_AI_FOUNDRY_MODEL_DEPLOYMENT.",
    );
  }

  return { endpoint: endpoint.replace(/\/+$/, ""), apiKey, deployment };
}

async function foundryFetch(path, { method = "GET", body, isForm = false } = {}) {
  const { endpoint, apiKey } = getFoundryConfig();
  const url = `${endpoint}${path}${path.includes("?") ? "&" : "?"}api-version=${API_VERSION}`;

  const headers = { "api-key": apiKey };
  if (!isForm) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `Foundry request to ${path} failed (${response.status}).`);
  }
  return data;
}

export async function createFoundryAgent({ name, instructions }) {
  const { deployment } = getFoundryConfig();
  return foundryFetch("/assistants", {
    method: "POST",
    body: { model: deployment, name, instructions, tools: [] },
  });
}

export async function updateFoundryAgent({ foundryAgentId, instructions, tools, toolResources }) {
  const body = {};
  if (instructions !== undefined) body.instructions = instructions;
  if (tools !== undefined) body.tools = tools;
  if (toolResources !== undefined) body.tool_resources = toolResources;
  return foundryFetch(`/assistants/${foundryAgentId}`, { method: "POST", body });
}

export async function createFoundryVectorStore({ name }) {
  return foundryFetch("/vector_stores", { method: "POST", body: { name } });
}

export async function attachVectorStoreToAgent({ foundryAgentId, vectorStoreId }) {
  return updateFoundryAgent({
    foundryAgentId,
    tools: [{ type: "file_search" }],
    toolResources: { file_search: { vector_store_ids: [vectorStoreId] } },
  });
}

export async function uploadFoundryFile({ buffer, filename, mimeType }) {
  const form = new FormData();
  form.append("purpose", "assistants");
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  return foundryFetch("/files", { method: "POST", body: form, isForm: true });
}

export async function addFileToVectorStore({ vectorStoreId, fileId }) {
  return foundryFetch(`/vector_stores/${vectorStoreId}/files`, {
    method: "POST",
    body: { file_id: fileId },
  });
}

export async function deleteFoundryFile({ fileId }) {
  return foundryFetch(`/files/${fileId}`, { method: "DELETE" });
}

export async function createFoundryThread() {
  return foundryFetch("/threads", { method: "POST", body: {} });
}

export async function addMessageToThread({ threadId, content }) {
  return foundryFetch(`/threads/${threadId}/messages`, {
    method: "POST",
    body: { role: "user", content },
  });
}

export async function listThreadMessages({ threadId, limit = 30 }) {
  const data = await foundryFetch(`/threads/${threadId}/messages?order=asc&limit=${limit}`);
  return data.data ?? [];
}

function extractMessageText(message) {
  return (message.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text?.value ?? "")
    .join("\n")
    .trim();
}

// Adds the user's message, runs the agent, and polls until the run finishes
// (or POLL_TIMEOUT_MS elapses) — the Assistants-style API has no synchronous
// "just give me the reply" call, runs are asynchronous by design.
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 45000;

export async function sendMessageAndGetReply({ threadId, foundryAgentId, content }) {
  await addMessageToThread({ threadId, content });
  let run = await foundryFetch(`/threads/${threadId}/runs`, {
    method: "POST",
    body: { assistant_id: foundryAgentId },
  });

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (["queued", "in_progress", "requires_action"].includes(run.status)) {
    if (Date.now() > deadline) {
      throw new Error("The agent took too long to respond.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    run = await foundryFetch(`/threads/${threadId}/runs/${run.id}`);
  }

  if (run.status !== "completed") {
    throw new Error(`The agent run ended with status "${run.status}".`);
  }

  const messages = await listThreadMessages({ threadId, limit: 5 });
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");

  return {
    reply: latestAssistantMessage ? extractMessageText(latestAssistantMessage) : "",
    usage: run.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}
