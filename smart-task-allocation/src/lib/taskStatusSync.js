/**
 * Move scheduled tasks into progress once their start time has arrived.
 *
 * This is intentionally server-side so every workspace sees the same persisted
 * status instead of deriving a different display-only status in the browser.
 */
export async function syncStartedTaskStatuses(supabase, organizationId) {
  if (!organizationId) return;

  const { error } = await supabase
    .from("task")
    .update({ status: "In Progress", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("status", "Open")
    .not("start_datetime", "is", null)
    .lte("start_datetime", new Date().toISOString());

  if (error) {
    throw new Error(`Could not update scheduled task statuses: ${error.message}`);
  }
}
