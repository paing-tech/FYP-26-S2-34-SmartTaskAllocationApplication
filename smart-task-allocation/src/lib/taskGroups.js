export const AI_RECOMMENDATIONS_GROUP_NAME = "AI Recommendations";
export const UNTITLED_GROUP_NAME = "Untitled";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function minSortOrder(groups) {
  return (groups ?? []).reduce((min, group) => {
    const sortOrder = Number(group.sort_order);
    return Number.isFinite(sortOrder) ? Math.min(min, sortOrder) : min;
  }, 0);
}

function maxSortOrder(groups) {
  return (groups ?? []).reduce((max, group) => {
    const sortOrder = Number(group.sort_order);
    return Number.isFinite(sortOrder) ? Math.max(max, sortOrder) : max;
  }, -1);
}

// Resolves the single reserved task group that AI-authored tasks (Optimus AI
// recurring follow-ups, the Optimus AI chat) land in pending manager
// approval. Renames a pre-existing "New" group in place — that was this
// group's name before it was reserved for AI use — instead of creating a
// duplicate, so existing organizations keep their task history intact.
// Always pinned to sort before every other group, regardless of when it was
// created, so it reliably renders as the board's first column.
export async function ensureAiRecommendationsGroup(supabase, organizationId) {
  const { data: existingGroups, error: groupError } = await supabase
    .from("task_group")
    .select("group_id, group_name, sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  if (groupError) {
    throw new Error(groupError.message);
  }

  const existing = (existingGroups ?? []).find(
    (group) => cleanString(group.group_name).toLowerCase() === AI_RECOMMENDATIONS_GROUP_NAME.toLowerCase(),
  );
  if (existing) {
    return existing.group_id;
  }

  const firstSlot = minSortOrder(existingGroups) - 1;

  const legacyNewGroup = (existingGroups ?? []).find(
    (group) => cleanString(group.group_name).toLowerCase() === "new",
  );
  if (legacyNewGroup) {
    const { error: renameError } = await supabase
      .from("task_group")
      .update({
        group_name: AI_RECOMMENDATIONS_GROUP_NAME,
        sort_order: firstSlot,
        updated_at: new Date().toISOString(),
      })
      .eq("group_id", legacyNewGroup.group_id);

    if (renameError) {
      throw new Error(renameError.message);
    }
    return legacyNewGroup.group_id;
  }

  const { data: createdGroup, error: createGroupError } = await supabase
    .from("task_group")
    .insert({
      organization_id: organizationId,
      group_name: AI_RECOMMENDATIONS_GROUP_NAME,
      sort_order: firstSlot,
    })
    .select("group_id")
    .single();

  if (createGroupError) {
    throw new Error(createGroupError.message);
  }

  return createdGroup.group_id;
}

// Resolves the group that tasks created/left without a group land in —
// always pinned to sort after every other group, so it reliably renders as
// the board's last column instead of silently vanishing into the first one.
export async function ensureUntitledGroup(supabase, organizationId) {
  const { data: existingGroups, error: groupError } = await supabase
    .from("task_group")
    .select("group_id, group_name, sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  if (groupError) {
    throw new Error(groupError.message);
  }

  const existing = (existingGroups ?? []).find(
    (group) => cleanString(group.group_name).toLowerCase() === UNTITLED_GROUP_NAME.toLowerCase(),
  );
  if (existing) {
    return existing.group_id;
  }

  const { data: createdGroup, error: createGroupError } = await supabase
    .from("task_group")
    .insert({
      organization_id: organizationId,
      group_name: UNTITLED_GROUP_NAME,
      sort_order: maxSortOrder(existingGroups) + 1,
    })
    .select("group_id")
    .single();

  if (createGroupError) {
    throw new Error(createGroupError.message);
  }

  return createdGroup.group_id;
}
