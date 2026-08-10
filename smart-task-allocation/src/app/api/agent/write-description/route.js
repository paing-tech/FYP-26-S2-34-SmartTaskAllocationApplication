import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Used when OpenAI is unavailable (no key) or fails — keeps the button working.
function fallbackDescription(title) {
  return `Complete "${title}" and confirm the outcome meets expectations.`;
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

    if (!title) {
      return NextResponse.json({ error: "Task title is required." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ description: fallbackDescription(title) });
    }

    try {
      const prompt = `Write a short, practical task description (1-2 sentences, no fluff) for a task titled "${title}".
Return ONLY JSON of the form {"description":"<the description>"}.`;

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
          temperature: 0.6,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || "OpenAI request failed.");
      }

      const content = data.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content);
      const description = typeof parsed.description === "string" ? parsed.description.trim() : "";

      return NextResponse.json({ description: description || fallbackDescription(title) });
    } catch {
      // Never block the workflow on AI failure — fall back to a basic description.
      return NextResponse.json({ description: fallbackDescription(title) });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
