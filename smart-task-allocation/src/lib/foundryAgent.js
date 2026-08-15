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

// Structured-output escape hatch for "create these tasks" requests — the
// model calls this instead of (or alongside) replying in prose, and the
// caller turns the arguments into a selectable proposal in the chat UI
// rather than creating anything automatically.
const GROUP_NAME_FIELD = {
  type: "string",
  description:
    "The board column this task belongs on — pick the closest match from the list of existing columns you were given. Leave blank only if none of them fit.",
};

const PROPOSE_TASKS_TOOL = {
  type: "function",
  name: "propose_tasks",
  description:
    "Propose one or more work tasks to create in the manager's workspace. Only call this when the user has clearly asked to create, plan, or automate work — never for general conversation or questions.",
  parameters: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"] },
            requiredSkillNames: { type: "array", items: { type: "string" } },
            groupName: GROUP_NAME_FIELD,
          },
          required: ["title", "description", "priority"],
        },
      },
    },
    required: ["tasks"],
  },
};

// Only offered to callers that have verified the sender is the one trusted
// Telegram username configured on the agent (see the webhook route) — the
// model is never even given this capability for anyone else, rather than
// relying on it to police itself. Tasks made this way go onto the board
// immediately (pending approval unless auto-approve was explicitly asked
// for), so the model must place each one in the right column itself instead
// of leaving that to a human afterward.
const CREATE_TASKS_NOW_TOOL = {
  type: "function",
  name: "create_tasks_now",
  description:
    "Create one or more work tasks immediately when the user has explicitly stated both the task(s) to create AND whether they need approval (e.g. 'create a task to restock shelf A, auto-approve it' or 'create X, needs approval'). Only call this when the approval preference is stated explicitly — if it's not, use propose_tasks instead so a human can decide.",
  parameters: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"] },
            groupName: GROUP_NAME_FIELD,
          },
          required: ["title", "description", "priority"],
        },
      },
      needsApproval: {
        type: "boolean",
        description: "true if these tasks should require manager approval before going live, false to auto-approve them immediately.",
      },
    },
    required: ["tasks", "needsApproval"],
  },
};

// Only offered to a User Admin's agent, with the org's real roster injected
// into instructions so the model grounds names against actual people
// instead of inventing them. Executed directly (see the messages route) —
// there's no per-item review step, since setting up the chart is a one-shot
// setup action rather than an ongoing workflow decision like task approval.
const ARRANGE_ORG_CHART_TOOL = {
  type: "function",
  name: "arrange_org_chart",
  description:
    "Set up the organization chart — departments and reporting connections between existing people — based on an uploaded org chart document. Only call this when the user has asked you to build, arrange, or set up the org chart from their uploaded document. Only reference real people from the roster you were given; never invent a person.",
  parameters: {
    type: "object",
    properties: {
      departments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            memberNames: { type: "array", items: { type: "string" } },
            order: {
              type: "integer",
              description:
                "The left-to-right column position of this department's box, 0 = leftmost. Set this from the document's actual layout (e.g. if the document shows Warehouse, Marketing, Retail left to right, use 0, 1, 2) so placement is deterministic instead of guessed from list order.",
            },
          },
          required: ["name", "memberNames"],
        },
      },
      connections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fromName: { type: "string", description: "The manager or person being reported to." },
            toName: { type: "string", description: "The person who reports to fromName." },
            fromHandle: {
              type: "string",
              enum: ["top", "right", "bottom", "left"],
              description: "Which side of fromName's avatar box the line starts from. Defaults to bottom if omitted.",
            },
            toHandle: {
              type: "string",
              enum: ["top", "right", "bottom", "left"],
              description: "Which side of toName's avatar box the line arrives at. Defaults to top if omitted.",
            },
          },
          required: ["fromName", "toName"],
        },
      },
    },
    required: ["departments", "connections"],
  },
};

// Only offered to a User Admin's agent (see the messages route), which
// prefetches today's schedule data and passes it straight in — there's
// nothing for the model to specify, so no parameters. Unlike the other
// tools, this one's result is real data, not a canned confirmation: the
// follow-up call below feeds it the actual schedule so it can answer in
// prose grounded in today's real numbers instead of guessing from memory.
const TODAYS_SCHEDULE_TOOL = {
  type: "function",
  name: "get_todays_schedule",
  description:
    "Look up today's work schedule: who is scheduled to work today, what time each person is scheduled, and whether they've already clocked in. Always reflects the current day only. Call this whenever the user asks about today's schedule, a specific person's hours today, or clock-in status — never guess or answer from memory.",
  parameters: { type: "object", properties: {}, required: [] },
};

// Only offered to a Platform Admin's agent (see the messages route). No
// parameters — the model can't specify which feedback to look at, it always
// analyzes whatever's unprocessed. This is an action tool like
// arrange_org_chart, not a data tool like get_todays_schedule: the actual
// AI-drafting + DB writes happen in the caller (messages route) after this
// call returns, via the same curateTestimonialsFromFeedback() the "Curate
// from feedback" button calls — never auto-published, drafts always land
// as Pending awaiting a human's Approve/Reject.
const CURATE_TESTIMONIALS_TOOL = {
  type: "function",
  name: "curate_testimonials",
  description:
    "Analyze recent user feedback (Feedback-category Contact Support submissions) and draft candidate testimonials for the public marketing website. Drafted testimonials always land as Pending, awaiting Platform Admin approval — never published automatically. Only call this when explicitly asked to review feedback, find good testimonials, or curate testimonials.",
  parameters: { type: "object", properties: {}, required: [] },
};

// Only offered to an Employee's agent (see the messages route), scoped to
// that one employee's own schedule and own active tasks only — never
// anyone else's (that's what get_todays_schedule is for, and it's User
// Admin-only). A data tool like get_todays_schedule: the messages route
// prefetches the real numbers and feeds them back in the follow-up call
// below, so the model summarizes real data instead of guessing.
const MY_DAY_TOOL = {
  type: "function",
  name: "get_my_day",
  description:
    "Look up the current user's own schedule and active tasks for today — their scheduled hours, whether they've clocked in, and a summary of each task assigned to them (title, description, start/end time, priority) so they don't have to open every task individually. Always the current user's own data only, never a coworker's. Call this whenever they ask what's on their plate today, their schedule, or for a summary of their tasks.",
  parameters: { type: "object", properties: {}, required: [] },
};

const TOOL_NAMES = [
  "propose_tasks",
  "create_tasks_now",
  "arrange_org_chart",
  "get_todays_schedule",
  "curate_testimonials",
  "get_my_day",
];

function findToolCall(response) {
  return (response.output ?? []).find((item) => item.type === "function_call" && TOOL_NAMES.includes(item.name));
}

function parseTasks(call) {
  try {
    const args = JSON.parse(call.arguments || "{}");
    if (!Array.isArray(args.tasks) || !args.tasks.length) return null;
    return call.name === "create_tasks_now"
      ? { tasks: args.tasks, needsApproval: Boolean(args.needsApproval) }
      : { tasks: args.tasks };
  } catch {
    return null;
  }
}

function parseOrgChart(call) {
  try {
    const args = JSON.parse(call.arguments || "{}");
    const departments = Array.isArray(args.departments) ? args.departments : [];
    const connections = Array.isArray(args.connections) ? args.connections : [];
    if (!departments.length && !connections.length) return null;
    return { departments, connections };
  } catch {
    return null;
  }
}

function sumUsage(...responses) {
  return responses.reduce(
    (total, response) => ({
      prompt_tokens: total.prompt_tokens + (response?.usage?.input_tokens ?? 0),
      completion_tokens: total.completion_tokens + (response?.usage?.output_tokens ?? 0),
      total_tokens: total.total_tokens + (response?.usage?.total_tokens ?? 0),
    }),
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  );
}

// Turns plain text into the Responses API's multimodal message shape when
// images are attached — the model can only actually "see" a picture (read
// labels, layout, etc.) via a real input_image block, never via file_search.
function buildInput(text, images) {
  if (!images?.length) return text;
  return [
    {
      role: "user",
      content: [
        { type: "input_text", text },
        ...images.map((image) => ({ type: "input_image", image_url: image.dataUrl })),
      ],
    },
  ];
}

export async function sendMessageAndGetReply({
  instructions,
  input,
  previousResponseId,
  vectorStoreId,
  allowDirectCreate,
  orgChartRoster,
  taskGroups,
  todaysSchedule,
  allowTestimonialCuration,
  myDayAgenda,
  images,
}) {
  const { deployment } = getFoundryConfig();
  const resolvedInput = buildInput(input, images);

  let augmentedInstructions = `${instructions || ""}

You can propose actionable work tasks using the propose_tasks tool whenever the user clearly wants something created, planned, or automated. Only call it when they've clearly asked for that — otherwise just respond conversationally without calling it.`;
  if (allowDirectCreate) {
    augmentedInstructions +=
      " This user is trusted to create tasks directly: if they clearly state both the task(s) and whether they need approval in the same message, use create_tasks_now instead of propose_tasks.";
  }
  if (taskGroups?.length) {
    augmentedInstructions += ` The workspace board currently has these columns: ${taskGroups.join(", ")}. When you create or propose a task, set groupName to whichever of these columns it best belongs in (e.g. a brand-new task usually belongs in a "To-do"-style column, not a "Completed" one) — never invent a column name that isn't in this list.`;
  }
  if (orgChartRoster?.length) {
    augmentedInstructions += ` You can also set up the organization chart with the arrange_org_chart tool when asked to build/arrange it from an uploaded document. The real people in this organization are: ${orgChartRoster.join(", ")}. Only reference these exact names — never invent a person who isn't in this list; match names from the document to the closest name here.`;
  }
  if (todaysSchedule) {
    augmentedInstructions += " You can also look up today's real work schedule with the get_todays_schedule tool — who's working today, their scheduled hours, and whether they've clocked in yet.";
  }
  if (allowTestimonialCuration) {
    augmentedInstructions += " You can also analyze recent user feedback and draft candidate public testimonials with the curate_testimonials tool — the drafts always need Platform Admin approval before they go live, so never claim they're already published.";
  }
  if (myDayAgenda) {
    augmentedInstructions += " You can also look up the user's own real schedule and active tasks for today with the get_my_day tool — their scheduled hours, clock-in status, and a summary of each task assigned to them. This is always their own data only, never a coworker's.";
  }
  augmentedInstructions = augmentedInstructions.trim();

  const tools = [PROPOSE_TASKS_TOOL];
  if (allowDirectCreate) tools.push(CREATE_TASKS_NOW_TOOL);
  if (orgChartRoster?.length) tools.push(ARRANGE_ORG_CHART_TOOL);
  if (todaysSchedule) tools.push(TODAYS_SCHEDULE_TOOL);
  if (allowTestimonialCuration) tools.push(CURATE_TESTIMONIALS_TOOL);
  if (myDayAgenda) tools.push(MY_DAY_TOOL);
  if (vectorStoreId) tools.push({ type: "file_search", vector_store_ids: [vectorStoreId] });

  async function callResponses(prevId) {
    const body = { model: deployment, instructions: augmentedInstructions, input: resolvedInput, tools };
    if (prevId) body.previous_response_id = prevId;
    return foundryFetch("/responses", { method: "POST", body });
  }

  let response;
  try {
    response = await callResponses(previousResponseId);
  } catch (error) {
    // previous_response_id chains can get permanently wedged if a function
    // call was ever left unresolved on an earlier turn (a bug, an old
    // deploy, a crash mid-request) — that's unrecoverable, so drop the
    // broken history and start this thread's context fresh rather than
    // failing every message in it forever.
    if (previousResponseId && /tool output/i.test(error.message)) {
      response = await callResponses(undefined);
    } else {
      throw error;
    }
  }

  const functionCall = findToolCall(response);
  if (!functionCall) {
    return {
      responseId: response.id,
      reply: extractResponseText(response),
      proposedTasks: null,
      createTasksNow: null,
      arrangeOrgChart: null,
      curateTestimonials: false,
      usage: sumUsage(response),
    };
  }

  const isTaskTool = functionCall.name === "propose_tasks" || functionCall.name === "create_tasks_now";
  const parsedTasks = isTaskTool ? parseTasks(functionCall) : null;
  const proposedTasks = functionCall.name === "propose_tasks" ? parsedTasks?.tasks ?? null : null;
  const createTasksNow = functionCall.name === "create_tasks_now" ? parsedTasks : null;
  const arrangeOrgChart = functionCall.name === "arrange_org_chart" ? parseOrgChart(functionCall) : null;
  const curateTestimonials = functionCall.name === "curate_testimonials";

  let followUpOutput = "Done.";
  if (functionCall.name === "create_tasks_now") {
    followUpOutput = "The tasks are being created now.";
  } else if (functionCall.name === "propose_tasks") {
    followUpOutput = "The proposed tasks were shown to the user to review, select, and confirm. Do not create them yourself.";
  } else if (functionCall.name === "arrange_org_chart") {
    followUpOutput = "The organization chart is being set up now.";
  } else if (functionCall.name === "get_todays_schedule") {
    followUpOutput = todaysSchedule?.length
      ? JSON.stringify(todaysSchedule)
      : "No one is scheduled to work today.";
  } else if (functionCall.name === "curate_testimonials") {
    followUpOutput = "Feedback is being analyzed now — drafted testimonials will need your approval before they go live.";
  } else if (functionCall.name === "get_my_day") {
    followUpOutput = myDayAgenda ? JSON.stringify(myDayAgenda) : "No schedule or task data available.";
  }

  // The API rejects the *next* previous_response_id-chained call if a
  // function call from this response is left unresolved, so close the loop
  // immediately — nothing actually "executes" the tool here, the caller
  // (web UI or Telegram webhook) decides what happens with the result.
  const followUp = await foundryFetch("/responses", {
    method: "POST",
    body: {
      model: deployment,
      instructions: augmentedInstructions,
      tools,
      previous_response_id: response.id,
      input: [
        {
          type: "function_call_output",
          call_id: functionCall.call_id,
          output: followUpOutput,
        },
      ],
    },
  });

  return {
    responseId: followUp.id,
    reply: extractResponseText(followUp) || extractResponseText(response),
    proposedTasks,
    createTasksNow,
    arrangeOrgChart,
    curateTestimonials,
    usage: sumUsage(response, followUp),
  };
}
