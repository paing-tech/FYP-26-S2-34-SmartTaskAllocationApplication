import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

export async function authHeaderOnly() {
  const headers = await authHeaders();
  delete headers["Content-Type"];
  return headers;
}

export async function resolveSkillIds(skillNames, headers) {
  const ids = [];
  for (const name of skillNames) {
    const response = await fetch("/api/skills", {
      method: "POST",
      headers,
      body: JSON.stringify({ skillName: name }),
    });
    const result = await response.json();
    if (response.ok && result.skill?.skill_id) {
      ids.push(result.skill.skill_id);
    }
  }
  return ids;
}

// Creates each selected proposed task via the existing /api/tasks endpoint
// (source: "optimus_ai" so it renders through the same Approve/Reject card
// as every other AI-authored task) and triggers auto-allocation once done.
// When needsApproval is false, the task is stamped pre-approved so it skips
// straight past the pending-approval UI.
export async function createProposedTasks(tasks, { agentName, needsApproval, groupId, headers }) {
  const created = [];
  const approvedAt = new Date().toISOString();

  for (const task of tasks) {
    const requiredSkillIds = task.requiredSkillNames?.length
      ? await resolveSkillIds(task.requiredSkillNames, headers)
      : [];

    const reasons = {
      creation: [`Proposed by ${agentName} in chat.`],
      creationKind: "agent_chat",
      agentName,
    };
    if (!needsApproval) {
      reasons.approvedBy = agentName;
      reasons.approvedAt = approvedAt;
    }

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({
        groupId,
        title: task.title,
        description: task.description,
        priority: task.priority || "Medium",
        assignedBy: agentName,
        source: "optimus_ai",
        aiState: needsApproval ? "active" : "accepted",
        reasons,
        requiredSkillIds,
      }),
    });
    const result = await response.json();
    if (response.ok) {
      created.push(result.task?.title ?? task.title);
    }
  }

  if (created.length) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ action: "auto-allocate-tasks", enabled: true }),
    });
  }

  return created;
}
