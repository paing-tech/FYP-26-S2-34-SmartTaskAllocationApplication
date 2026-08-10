export function validateTaskSchedule(startDatetime, endDatetime, { rejectPast = false } = {}) {
  if (!startDatetime && !endDatetime) return null;
  if (!startDatetime || !endDatetime) return "Both task start and end times are required when scheduling a task.";
  const start = new Date(startDatetime);
  const end = new Date(endDatetime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Enter valid task start and end times.";
  if (end <= start) return "Task end time must be later than the start time.";
  if (rejectPast && start < new Date()) return "Task start time must be in the future.";
  return null;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

function taskHours(task) {
  if (!task?.start_datetime || !task?.end_datetime) return 0;
  return Math.max(0, (new Date(task.end_datetime) - new Date(task.start_datetime)) / 3600000);
}

export async function validateTaskAssignee(supabase, { taskId, task: providedTask, userId, organizationId, requiredSkillIds }) {
  let task = providedTask;
  if (!task && taskId) {
    const { data, error } = await supabase.from("task").select("*").eq("task_id", taskId).maybeSingle();
    if (error) return error.message;
    task = data;
  }
  if (!task || !userId || !organizationId || task.organization_id !== organizationId) return "Task or employee was not found in this organization.";

  const { data: account } = await supabase
    .from("user_account")
    .select("role:role_id(role_name)")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (String(account?.role?.role_name || "").toLowerCase() !== "employee") return "Tasks can only be assigned to Employee accounts.";

  if (taskId) {
    const { data: existingAssignees } = await supabase.from("task_assignee").select("user_id").eq("task_id", taskId);
    if ((existingAssignees ?? []).some((row) => row.user_id === userId)) return "This employee is already assigned to the task.";
    if (task.assigned_to || (existingAssignees ?? []).length) return "This task position is already fully allocated.";
  }

  let requiredIds = (requiredSkillIds ?? []).map(String);
  let requiredNames = new Map();
  if (taskId && requiredSkillIds === undefined) {
    const { data: rows } = await supabase.from("task_skill").select("skill_id, skill:skill_id(skill_name)").eq("task_id", taskId);
    requiredIds = (rows ?? []).map((row) => String(row.skill_id));
    requiredNames = new Map((rows ?? []).map((row) => [String(row.skill_id), row.skill?.skill_name]));
  }
  if (requiredIds.length) {
    const { data: userSkills } = await supabase.from("user_skill").select("skill_id").eq("user_id", userId);
    const userSkillIds = new Set((userSkills ?? []).map((row) => String(row.skill_id)));
    const missing = requiredIds.filter((id) => !userSkillIds.has(id));
    if (missing.length) return `Employee is missing required skill: ${missing.map((id) => requiredNames.get(id) || id).join(", ")}.`;
  }

  if (task.start_datetime && task.end_datetime) {
    const { data: availability } = await supabase.from("availability").select("status, availability_start, availability_end").eq("user_id", userId);
    if ((availability ?? []).length) {
      const fullyAvailable = availability.some((row) =>
        String(row.status).toLowerCase() === "available" &&
        new Date(row.availability_start) <= new Date(task.start_datetime) &&
        new Date(row.availability_end) >= new Date(task.end_datetime),
      );
      if (!fullyAvailable) return "Employee is unavailable during the task period.";
    }

    const { data: assignedRows } = await supabase.from("task_assignee").select("task_id").eq("user_id", userId);
    const assignedIds = (assignedRows ?? []).map((row) => row.task_id).filter((id) => id !== taskId);
    let assignedTasks = [];
    if (assignedIds.length) {
      const { data } = await supabase.from("task").select("task_id, title, status, start_datetime, end_datetime").in("task_id", assignedIds);
      assignedTasks = (data ?? []).filter((row) => !["completed", "cancelled", "archived"].includes(String(row.status).toLowerCase()));
    }
    const conflict = assignedTasks.find((row) => overlaps(task.start_datetime, task.end_datetime, row.start_datetime, row.end_datetime));
    if (conflict) return `Scheduling conflict with ${conflict.title}.`;

    const { data: organization } = await supabase.from("organization").select("weekly_hour_limit").eq("organization_id", organizationId).maybeSingle();
    const weeklyLimit = Number(organization?.weekly_hour_limit ?? 40);
    const weekStart = new Date(task.start_datetime);
    const day = weekStart.getUTCDay();
    weekStart.setUTCDate(weekStart.getUTCDate() - ((day + 6) % 7));
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const scheduledHours = assignedTasks
      .filter((row) => row.start_datetime && new Date(row.start_datetime) >= weekStart && new Date(row.start_datetime) < weekEnd)
      .reduce((sum, row) => sum + taskHours(row), 0);
    const projectedHours = scheduledHours + taskHours(task);
    if (Number.isFinite(weeklyLimit) && projectedHours > weeklyLimit) return `Assignment would exceed the ${weeklyLimit}-hour weekly working limit (${projectedHours.toFixed(1)} projected hours).`;
  }

  return null;
}
