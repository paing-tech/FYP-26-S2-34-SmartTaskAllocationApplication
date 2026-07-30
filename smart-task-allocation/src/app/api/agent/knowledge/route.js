import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { uploadFoundryFile, addFileToVectorStore, deleteFoundryFile } from "@/lib/foundryAgent";

const BUCKET = "agent-knowledge";
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "image/png",
]);

async function getMyAgent(supabase, user) {
  const { data } = await supabase.from("agent").select("*").eq("user_id", user.id).maybeSingle();
  return data ?? null;
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const agent = await getMyAgent(supabase, user);
    if (!agent) {
      return NextResponse.json({ files: [] });
    }

    const { data, error } = await supabase
      .from("agent_knowledge_file")
      .select("*")
      .eq("agent_id", agent.agent_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ files: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const agent = await getMyAgent(supabase, user);
    if (!agent) {
      return NextResponse.json({ error: "Create your agent before adding knowledge." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "A file is required." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only PDF, Word, TXT, Markdown, or PNG files are allowed." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "The file must be 20MB or smaller." }, { status: 400 });
    }

    const extension = (file.name?.split(".").pop() || "pdf").toLowerCase();
    const storagePath = `${agent.agent_id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const foundryFile = await uploadFoundryFile({ buffer, filename: file.name, mimeType: file.type });
    await addFileToVectorStore({ vectorStoreId: agent.foundry_vector_store_id, fileId: foundryFile.id });

    const { data: created, error: insertError } = await supabase
      .from("agent_knowledge_file")
      .insert({
        agent_id: agent.agent_id,
        foundry_file_id: foundryFile.id,
        filename: file.name,
        storage_path: storagePath,
        file_size_bytes: file.size,
        uploaded_by: user.id,
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ file: created });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const agent = await getMyAgent(supabase, user);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("id");
    if (!fileId) {
      return NextResponse.json({ error: "File ID is required." }, { status: 400 });
    }

    const { data: fileRow, error: fetchError } = await supabase
      .from("agent_knowledge_file")
      .select("*")
      .eq("agent_knowledge_file_id", fileId)
      .eq("agent_id", agent.agent_id)
      .maybeSingle();
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }
    if (!fileRow) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    await deleteFoundryFile({ fileId: fileRow.foundry_file_id }).catch(() => {});
    await supabase.storage.from(BUCKET).remove([fileRow.storage_path]).catch(() => {});

    const { error: deleteError } = await supabase
      .from("agent_knowledge_file")
      .delete()
      .eq("agent_knowledge_file_id", fileId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
