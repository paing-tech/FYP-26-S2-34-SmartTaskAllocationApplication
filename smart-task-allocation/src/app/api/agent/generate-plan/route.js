import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Deterministic group names per methodology (used for the prompt and fallback).
const GROUP_TEMPLATES = {
  general: ["To Do", "In Progress", "Done"],
  scrum: ["Week 1", "Week 2", "Week 3", "Week 4"],
  kanban: ["Backlog", "To Do", "In Progress", "Done"],
  waterfall: ["Requirements", "Design", "Implementation", "Testing", "Deployment"],
};

function templateFor(methodology) {
  return GROUP_TEMPLATES[methodology] ?? GROUP_TEMPLATES.general;
}

// Plan used when OpenAI is unavailable (no key) or fails — keeps the agent working.
function fallbackPlan(projectName, methodology) {
  const groups = templateFor(methodology).map((name) => ({
    name,
    tasks: [
      { title: `${name}: plan ${projectName}` },
      { title: `${name}: execute ${projectName} work` },
    ],
  }));
  return { groups };
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const body = await request.json();
    const projectName = (body.projectName || "New Project").trim();
    const duration = (body.duration || "1 month").trim();
    const methodology = (body.methodology || "kanban").toLowerCase();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(fallbackPlan(projectName, methodology));
    }

    const groupHint = templateFor(methodology).join(", ");
    const methodologyLine =
      methodology === "general"
        ? `Use simple, practical group names (suggested: ${groupHint}). This may be any kind of project (software, restaurant, events, etc.) — infer the domain from the name.`
        : `Use group names appropriate to the ${methodology} methodology (suggested: ${groupHint}).`;
    const prompt = `You are an expert project planner.
Create a delivery plan for the project "${projectName}" lasting ${duration}.
${methodologyLine}
Return ONLY JSON of the form:
{"groups":[{"name":"<group name>","tasks":[{"title":"<short actionable task>"}]}]}
Rules: 3-6 groups, 2-5 concise tasks per group, each task specific to "${projectName}".`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || "OpenAI request failed.");
    }

    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    const groups = Array.isArray(parsed.groups) ? parsed.groups : [];

    // Normalize and guard against malformed AI output.
    const cleanGroups = groups
      .map((group) => ({
        name: typeof group?.name === "string" ? group.name.trim() : "",
        tasks: (Array.isArray(group?.tasks) ? group.tasks : [])
          .map((task) => ({
            title: typeof task === "string" ? task.trim() : (task?.title || "").trim(),
          }))
          .filter((task) => task.title),
      }))
      .filter((group) => group.name && group.tasks.length);

    if (!cleanGroups.length) {
      return NextResponse.json(fallbackPlan(projectName, methodology));
    }

    return NextResponse.json({ groups: cleanGroups });
  } catch (error) {
    // Never block the workflow on AI failure — fall back to a basic plan.
    const projectName = "your project";
    return NextResponse.json({ ...fallbackPlan(projectName, "kanban"), warning: error.message });
  }
}
