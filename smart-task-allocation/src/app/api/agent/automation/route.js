import { NextResponse } from "next/server";
import Papa from "papaparse";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { ensureAiRecommendationsGroup } from "@/lib/taskGroups";

async function getManagerOrganizationId(supabase, user) {
  const { data } = await supabase
    .from("user_account")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return data?.organization_id ?? null;
}

const PRIORITIES = new Set(["Low", "Medium", "High", "Urgent"]);
const MAX_CSV_ROWS = 60;
const MAX_TASKS = 8;

function parseCsvPreview(csvText) {
  if (!csvText || typeof csvText !== "string") {
    return { headers: [], rows: [], truncated: false };
  }

  const result = Papa.parse(csvText.trim(), { header: true, skipEmptyLines: true });
  const headers = result.meta?.fields ?? [];
  const allRows = Array.isArray(result.data) ? result.data : [];
  const rows = allRows.slice(0, MAX_CSV_ROWS);

  return { headers, rows, truncated: allRows.length > rows.length };
}

function csvPreviewToText({ headers, rows, truncated }) {
  if (!rows.length) return "";
  const lines = rows.map((row) => headers.map((header) => `${header}: ${row[header] ?? ""}`).join(", "));
  return `${lines.join("\n")}${truncated ? "\n… (more rows omitted)" : ""}`;
}

// Used when OpenAI is unavailable (no key) or fails — a simple keyword scan
// so the attach-a-CSV demo still works without an API key.
function fallbackAutomation({ headers, rows }, message) {
  if (!rows.length) {
    return {
      reply:
        "I can help create and auto-allocate tasks. Describe what you need, or attach an inventory CSV with item status (e.g. expired / out of stock) and I'll draft tasks for it.",
      tasks: [],
    };
  }

  const nameKey = headers.find((header) => /name|item|product/i.test(header)) ?? headers[0];
  const statusKey = headers.find((header) => /status|stock|expir|condition/i.test(header));

  const expired = [];
  const outOfStock = [];

  for (const row of rows) {
    const statusValue = statusKey ? String(row[statusKey] ?? "") : Object.values(row).join(" ");
    const itemName = String(row[nameKey] ?? "item");
    if (/expired/i.test(statusValue)) {
      expired.push(itemName);
    } else if (/out.?of.?stock|no\s*stock|^0$/i.test(statusValue)) {
      outOfStock.push(itemName);
    }
  }

  const tasks = [];
  if (expired.length) {
    tasks.push({
      title: "Remove expired items from shelf",
      description: `Pull the following expired items from the shelf and dispose of them per policy: ${expired.join(", ")}.`,
      priority: "High",
      requiredSkillNames: [],
    });
  }
  if (outOfStock.length) {
    tasks.push({
      title: "Order new batch for out-of-stock items",
      description: `Place a restock order for the following out-of-stock items: ${outOfStock.join(", ")}.`,
      priority: "Medium",
      requiredSkillNames: [],
    });
  }

  return {
    reply: tasks.length
      ? `Found ${expired.length} expired and ${outOfStock.length} out-of-stock item(s) in your CSV. I drafted ${tasks.length} task(s) below.`
      : "I read your CSV but didn't find any expired or out-of-stock items to act on.",
    tasks,
  };
}

function normalizeTasks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((task) => ({
      title: typeof task?.title === "string" ? task.title.trim() : "",
      description: typeof task?.description === "string" ? task.description.trim() : "",
      priority: PRIORITIES.has(task?.priority) ? task.priority : "Medium",
      requiredSkillNames: Array.isArray(task?.requiredSkillNames)
        ? task.requiredSkillNames.map((name) => String(name).trim()).filter(Boolean).slice(0, 5)
        : [],
    }))
    .filter((task) => task.title)
    .slice(0, MAX_TASKS);
}

// Resolves the reserved "AI Recommendations" group only when there are tasks
// to place in it — a pure conversational reply shouldn't create/rename groups.
async function resolveGroupIdIfNeeded(supabase, user, tasks) {
  if (!tasks.length) return null;
  const organizationId = await getManagerOrganizationId(supabase, user);
  if (!organizationId) return null;
  return ensureAiRecommendationsGroup(supabase, organizationId);
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const csvFileName = typeof body.csvFileName === "string" ? body.csvFileName.trim() : "";
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

    if (!message && !body.csvText) {
      return NextResponse.json({ error: "A message or attachment is required." }, { status: 400 });
    }

    const csvPreview = parseCsvPreview(body.csvText);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const fallback = fallbackAutomation(csvPreview, message);
      const groupId = await resolveGroupIdIfNeeded(supabase, user, fallback.tasks);
      return NextResponse.json({ ...fallback, groupId });
    }

    const csvSection = csvPreview.rows.length
      ? `\n\nAttached CSV "${csvFileName || "attachment.csv"}" (columns: ${csvPreview.headers.join(", ")}):\n${csvPreviewToText(csvPreview)}`
      : "";

    const systemPrompt = `You are Optimus AI, an operations assistant embedded in a manager's task-allocation app.
You can propose work tasks; the app will create them and auto-allocate each one to the best-matching employee by skill.
Typical patterns: a CSV row marked expired -> a task to remove/discard that item from the shelf; a row marked out of stock or zero quantity -> a task to order a new batch.
Only propose tasks when the manager's message or the attached data clearly calls for action. Otherwise just reply conversationally with an empty tasks array.
Return ONLY JSON of the form:
{"reply": "<short natural-language reply to show the manager>", "tasks": [{"title": "<short actionable title>", "description": "<one sentence>", "priority": "Low"|"Medium"|"High"|"Urgent", "requiredSkillNames": ["<skill>", "..."]}]}
Keep "tasks" to at most ${MAX_TASKS} items, and merge similar items into one task rather than one task per row.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history
        .filter((entry) => entry && (entry.role === "user" || entry.role === "assistant") && entry.content)
        .map((entry) => ({ role: entry.role, content: String(entry.content) })),
      { role: "user", content: `${message}${csvSection}` },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || "OpenAI request failed.");
    }

    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    const tasks = normalizeTasks(parsed.tasks);
    const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Done.";

    const groupId = await resolveGroupIdIfNeeded(supabase, user, tasks);
    return NextResponse.json({ reply, tasks, groupId });
  } catch (error) {
    return NextResponse.json({ reply: "I couldn't process that request. Please try again.", tasks: [], groupId: null, warning: error.message });
  }
}
