export const UNTITLED_GROUP_NAME = "Untitled";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function maxSortOrder(groups) {
  return (groups ?? []).reduce((max, group) => {
    const sortOrder = Number(group.sort_order);
    return Number.isFinite(sortOrder) ? Math.max(max, sortOrder) : max;
  }, -1);
}

// Matches an AI-chosen column name against the org's real task groups
// (case-insensitive, trimmed). Returns null when there's no confident match
// so the caller can fall back to ensureUntitledGroup instead of guessing.
export function matchTaskGroupByName(groups, groupName) {
  const wanted = cleanString(groupName).toLowerCase();
  if (!wanted) return null;

  const match = (groups ?? []).find((group) => cleanString(group.group_name).toLowerCase() === wanted);
  return match?.group_id ?? null;
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
