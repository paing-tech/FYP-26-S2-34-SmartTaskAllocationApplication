import { NextResponse } from "next/server";
import { getAuthenticatedUser, isPlatformAdminRole } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sendMessageAndGetReply } from "@/lib/foundryAgent";
import { matchTaskGroupByName } from "@/lib/taskGroups";
import { arrangeOrgChart } from "@/lib/orgChartAutomation";
import { getAccountsWithProfiles } from "@/app/api/my-organization/route";
import { getTodaysScheduleSummary } from "@/app/api/useradmin/workforce-schedule/route";
import { curateTestimonialsFromFeedback } from "@/lib/testimonialCuration";

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Shared gate for the two tools offered only to a User Admin's agent
// (org-chart setup and today's schedule lookup) — everyone else's agent
// never even sees them as options.
async function isUserAdminAgent(supabase, agent) {
  const { data: account } = await supabase
    .from("user_account")
    .select("role_id")
    .eq("user_id", agent.user_id)
    .maybeSingle();
  if (!account?.role_id) return false;

  const { data: role } = await supabase.from("role").select("role_name").eq("role_id", account.role_id).maybeSingle();
  return (role?.role_name ?? "").trim().toLowerCase() === "user admin";
}

async function getTodaysSchedule(supabase, agent) {
  if (!(await isUserAdminAgent(supabase, agent))) return null;
  return getTodaysScheduleSummary(supabase, agent.organization_id, todayDateStr());
}

// Gate for the curate_testimonials tool — Platform Admin only, same shape
// as isUserAdminAgent above but reusing serverAuth's role-name normalizer
// since Platform Admin accounts have no organization_id to key off of.
async function isPlatformAdminAgent(supabase, agent) {
  const { data: account } = await supabase
    .from("user_account")
    .select("role_id")
    .eq("user_id", agent.user_id)
    .maybeSingle();
  if (!account?.role_id) return false;

  const { data: role } = await supabase.from("role").select("role_name").eq("role_id", account.role_id).maybeSingle();
  return isPlatformAdminRole(role?.role_name);
}

async function getMyThread(supabase, user, threadId) {
  const { data: agent } = await supabase.from("agent").select("*").eq("user_id", user.id).maybeSingle();
  if (!agent) return { agent: null, thread: null };

  const { data: thread } = await supabase
    .from("agent_chat_thread")
    .select("*")
    .eq("agent_chat_thread_id", threadId)
    .eq("agent_id", agent.agent_id)
    .maybeSingle();

  return { agent, thread };
}

async function getOrgChartRoster(supabase, agent) {
  if (!(await isUserAdminAgent(supabase, agent))) return null;

  const { accounts } = await getAccountsWithProfiles(supabase, agent.organization_id);
  return (accounts ?? []).map((a) => a.full_name).filter(Boolean);
}

// Lets the model choose which board column a task belongs on instead of
// everything landing in one reserved, locked column.
async function getTaskGroups(supabase, organizationId) {
  const { data: groups } = await supabase
    .from("task_group")
    .select("group_id, group_name")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });
  return groups ?? [];
}

const KNOWLEDGE_BUCKET = "agent-knowledge";

// Attached only on a thread's first message — after that, the images are
// already part of this conversation's stored state via previous_response_id,
// same as we don't resend earlier text on every turn.
async function getKnowledgeImages(supabase, agentId) {
  const { data: files } = await supabase
    .from("agent_knowledge_file")
    .select("filename, storage_path, mime_type")
    .eq("agent_id", agentId);

  const images = [];
  for (const file of files ?? []) {
    // mime_type is only populated on files uploaded after this feature
    // shipped — fall back to the extension so earlier uploads still work.
    const mimeType = file.mime_type || (file.filename?.toLowerCase().endsWith(".png") ? "image/png" : null);
    if (!mimeType?.startsWith("image/")) continue;

    const { data: blob, error } = await supabase.storage.from(KNOWLEDGE_BUCKET).download(file.storage_path);
    if (error || !blob) {
      console.error("Could not download knowledge image:", file.storage_path, error?.message);
      continue;
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    images.push({ filename: file.filename, dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}` });
  }
  return images;
}

export async function GET(request, { params }) {
  try {
    const { threadId } = await params;
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { thread } = await getMyThread(supabase, user, threadId);
    if (!thread) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    return NextResponse.json({ messages: thread.messages ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { threadId } = await params;
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { agent, thread } = await getMyThread(supabase, user, threadId);
    if (!thread) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    const body = await request.json();
    const content = typeof body.message === "string" ? body.message.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "A message is required." }, { status: 400 });
    }

    const orgChartRoster = await getOrgChartRoster(supabase, agent);
    const todaysSchedule = await getTodaysSchedule(supabase, agent);
    const allowTestimonialCuration = await isPlatformAdminAgent(supabase, agent);
    const images = thread.last_response_id ? [] : await getKnowledgeImages(supabase, agent.agent_id);
    const taskGroups = await getTaskGroups(supabase, agent.organization_id);

    const {
      responseId,
      reply: modelReply,
      proposedTasks,
      arrangeOrgChart: orgChartArgs,
      curateTestimonials,
      usage,
    } = await sendMessageAndGetReply({
      instructions: agent.instructions,
      input: content,
      previousResponseId: thread.last_response_id,
      vectorStoreId: agent.foundry_vector_store_id,
      orgChartRoster,
      taskGroups: taskGroups.map((group) => group.group_name),
      todaysSchedule,
      allowTestimonialCuration,
      images,
    });

    const { error: usageInsertError } = await supabase.from("agent_token_usage").insert({
      agent_id: agent.agent_id,
      organization_id: agent.organization_id,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    });
    if (usageInsertError) {
      console.error("Could not record agent token usage:", usageInsertError.message);
    }

    let taskProposal = null;
    if (proposedTasks?.length) {
      const tasks = proposedTasks.map((task) => ({
        ...task,
        groupId: matchTaskGroupByName(taskGroups, task.groupName),
      }));
      taskProposal = { tasks };
    }

    let reply = modelReply;
    if (orgChartArgs) {
      const result = await arrangeOrgChart(supabase, {
        organizationId: agent.organization_id,
        departments: orgChartArgs.departments,
        connections: orgChartArgs.connections,
      });
      const summary = `Set up the org chart: ${result.departmentsCreated} department${result.departmentsCreated === 1 ? "" : "s"} created, ${result.membersAssigned} ${result.membersAssigned === 1 ? "person" : "people"} assigned, ${result.connectionsCreated} connection${result.connectionsCreated === 1 ? "" : "s"} drawn.${
        result.unmatchedNames.length ? ` Couldn't match: ${result.unmatchedNames.join(", ")}.` : ""
      }`;
      reply = reply ? `${reply}\n\n${summary}` : summary;
    }

    if (curateTestimonials) {
      try {
        const result = await curateTestimonialsFromFeedback(supabase);
        reply = reply ? `${reply}\n\n${result.message}` : result.message;
      } catch (curationError) {
        const summary = `Couldn't curate testimonials: ${curationError.message}`;
        reply = reply ? `${reply}\n\n${summary}` : summary;
      }
    }

    const updates = {
      updated_at: new Date().toISOString(),
      last_response_id: responseId,
      messages: [
        ...(thread.messages ?? []),
        { role: "user", content },
        { role: "assistant", content: reply, taskProposal },
      ],
    };
    if (thread.title === "New chat") {
      updates.title = content.slice(0, 60);
    }
    await supabase.from("agent_chat_thread").update(updates).eq("agent_chat_thread_id", thread.agent_chat_thread_id);

    return NextResponse.json({ reply, title: updates.title, taskProposal });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Persists a task proposal's resolution (which tasks were kept, whether
// they've been created) onto its message so a page reload shows the same
// closed-out state instead of a fresh, re-clickable checklist.
export async function PATCH(request, { params }) {
  try {
    const { threadId } = await params;
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { thread } = await getMyThread(supabase, user, threadId);
    if (!thread) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    const body = await request.json();
    const requestedIndex = Number(body.messageIndex);
    const taskProposal = body.taskProposal;
    const messages = thread.messages ?? [];

    function hasUnresolvedProposal(message) {
      return message?.role === "assistant" && message?.taskProposal && message.taskProposal.status !== "done";
    }

    // The client-supplied index isn't trusted as-is: it's only ever
    // meaningful when it actually points at the assistant message carrying
    // the proposal being resolved. If it doesn't (stale local state, a
    // reload mid-flow, etc.), fall back to the most recent assistant
    // message that still has an unresolved proposal — otherwise this can
    // silently patch the wrong message (observed patching the user's own
    // message instead, leaving the real proposal looking permanently
    // unresolved and re-clickable).
    let targetIndex = Number.isInteger(requestedIndex) && hasUnresolvedProposal(messages[requestedIndex])
      ? requestedIndex
      : -1;

    if (targetIndex === -1) {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (hasUnresolvedProposal(messages[index])) {
          targetIndex = index;
          break;
        }
      }
    }

    if (targetIndex === -1) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }

    const updatedMessages = messages.map((message, index) =>
      index === targetIndex ? { ...message, taskProposal } : message,
    );

    const { error } = await supabase
      .from("agent_chat_thread")
      .update({ messages: updatedMessages, updated_at: new Date().toISOString() })
      .eq("agent_chat_thread_id", thread.agent_chat_thread_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
