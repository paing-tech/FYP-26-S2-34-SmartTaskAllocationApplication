// Wrapper around Azure AI Foundry's unified /openai/v1 API (OpenAI-SDK
// compatible: no api-version query param, Bearer-token auth). Confirmed
// against this project's own "View code" sample from the Foundry portal.
// The Responses API has no persistent assistant/thread resource — model,
// instructions, and tools are passed on every call, and conversation
// continuity is a previous_response_id chain instead of a thread object.
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
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (!isForm) headers["Content-Type"] = "application/json";

  const response = await fetch(`${endpoint}${path}`, {
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

export async function createFoundryVectorStore({ name }) {
  return foundryFetch("/vector_stores", { method: "POST", body: { name } });
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

function extractResponseText(response) {
  if (typeof response.output_text === "string" && response.output_text) {
    return response.output_text;
  }
  const messageItem = (response.output ?? []).find((item) => item.type === "message");
  return (messageItem?.content ?? [])
    .filter((block) => block.type === "output_text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}

export async function sendMessageAndGetReply({ instructions, input, previousResponseId, vectorStoreId }) {
  const { deployment } = getFoundryConfig();
  const body = { model: deployment, instructions, input };
  if (previousResponseId) body.previous_response_id = previousResponseId;
  if (vectorStoreId) body.tools = [{ type: "file_search", vector_store_ids: [vectorStoreId] }];

  const response = await foundryFetch("/responses", { method: "POST", body });

  return {
    responseId: response.id,
    reply: extractResponseText(response),
    usage: {
      prompt_tokens: response.usage?.input_tokens ?? 0,
      completion_tokens: response.usage?.output_tokens ?? 0,
      total_tokens: response.usage?.total_tokens ?? 0,
    },
  };
}
