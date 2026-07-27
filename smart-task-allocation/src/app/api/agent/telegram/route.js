import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getBotInfo, setWebhook, deleteWebhook } from "@/lib/telegramBot";

async function getMyAgent(supabase, user) {
  const { data } = await supabase.from("agent").select("*").eq("user_id", user.id).maybeSingle();
  return data ?? null;
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const agent = await getMyAgent(supabase, user);
    if (!agent) {
      return NextResponse.json({ telegram: null });
    }

    const { data } = await supabase
      .from("agent_telegram_bot")
      .select("bot_username, created_at")
      .eq("agent_id", agent.agent_id)
      .maybeSingle();

    return NextResponse.json({ telegram: data ?? null });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const agent = await getMyAgent(supabase, user);
    if (!agent) {
      return NextResponse.json({ error: "Create your agent before connecting Telegram." }, { status: 404 });
    }

    const publicAppUrl = process.env.PUBLIC_APP_URL;
    if (!publicAppUrl) {
      return NextResponse.json(
        { error: "PUBLIC_APP_URL is not configured — Telegram needs a public HTTPS URL for its webhook." },
        { status: 500 },
      );
    }

    const body = await request.json();
    const botToken = typeof body.botToken === "string" ? body.botToken.trim() : "";
    if (!botToken) {
      return NextResponse.json({ error: "A bot token is required." }, { status: 400 });
    }

    const botInfo = await getBotInfo(botToken);
    const webhookSecret = crypto.randomUUID();
    const webhookUrl = `${publicAppUrl.replace(/\/+$/, "")}/api/agent/telegram/webhook/${webhookSecret}`;
    await setWebhook(botToken, webhookUrl);

    const { data: upserted, error: upsertError } = await supabase
      .from("agent_telegram_bot")
      .upsert(
        {
          agent_id: agent.agent_id,
          bot_token: botToken,
          bot_username: botInfo.username,
          webhook_secret: webhookSecret,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "agent_id" },
      )
      .select("bot_username, created_at")
      .single();

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    return NextResponse.json({ telegram: upserted });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const agent = await getMyAgent(supabase, user);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }

    const { data: existing } = await supabase
      .from("agent_telegram_bot")
      .select("bot_token")
      .eq("agent_id", agent.agent_id)
      .maybeSingle();

    if (existing) {
      await deleteWebhook(existing.bot_token).catch(() => {});
    }

    const { error: deleteError } = await supabase.from("agent_telegram_bot").delete().eq("agent_id", agent.agent_id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
