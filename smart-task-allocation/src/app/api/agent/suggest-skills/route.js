import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Keyword match between the task title/description and each skill name — used
// when OpenAI is unavailable (no key) or fails, so the picker still suggests
// something reasonable instead of nothing.
function fallbackSuggest(text, skills) {
  const normalized = text.toLowerCase();
  return skills
    .filter((skill) => normalized.includes(skill.skill_name.toLowerCase()))
    .map((skill) => skill.skill_id);
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const body = await request.json();
    const title = (body.title || "").trim();
    const description = (body.description || "").trim();

    if (!title) {
      return NextResponse.json({ error: "Task title is required." }, { status: 400 });
    }

    const { data: skills, error: skillsError } = await supabase
      .from("skill")
      .select("skill_id, skill_name");

    if (skillsError) {
      return NextResponse.json({ error: skillsError.message }, { status: 400 });
    }

    const skillList = skills ?? [];
    const combinedText = `${title} ${description}`.trim();

    if (!skillList.length) {
      return NextResponse.json({ skillIds: [] });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ skillIds: fallbackSuggest(combinedText, skillList) });
    }

    try {
      const skillNames = skillList.map((skill) => skill.skill_name);
      const prompt = `You are matching a task to the skills it requires.
Task title: "${title}"
Task description: "${description || "(none)"}"
Available skills (choose ONLY from this exact list, using exact spelling): ${skillNames.join(", ")}
Return ONLY JSON of the form {"skills":["<skill name>", ...]} containing the skills genuinely relevant to this task. Return an empty array if none clearly apply.`;

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
          temperature: 0.2,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || "OpenAI request failed.");
      }

      const content = data.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content);
      const suggestedNames = new Set(
        (Array.isArray(parsed.skills) ? parsed.skills : []).map((name) =>
          String(name).trim().toLowerCase(),
        ),
      );

      const skillIds = skillList
        .filter((skill) => suggestedNames.has(skill.skill_name.trim().toLowerCase()))
        .map((skill) => skill.skill_id);

      return NextResponse.json({ skillIds });
    } catch {
      // Never block the workflow on AI failure — fall back to keyword matching.
      return NextResponse.json({ skillIds: fallbackSuggest(combinedText, skillList) });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
