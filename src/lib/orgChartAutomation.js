import { getAccountsWithProfiles } from "@/app/api/my-organization/route";

const DEPARTMENT_DEFAULT_WIDTH = 420;
const DEPARTMENT_DEFAULT_HEIGHT = 320;
const DEPARTMENT_DEFAULT_GAP = 60;
const HANDLE_SIDES = new Set(["top", "right", "bottom", "left"]);

function normalizeName(name) {
  return (name ?? "").trim().toLowerCase();
}

// Best-effort match against the org's real roster — exact match first, then
// substring, since the model may shorten/expand a name from the document.
function matchAccount(accounts, name) {
  const target = normalizeName(name);
  if (!target) return null;
  return (
    accounts.find((account) => normalizeName(account.full_name) === target) ??
    accounts.find((account) => {
      const accountName = normalizeName(account.full_name);
      return accountName && (accountName.includes(target) || target.includes(accountName));
    }) ??
    null
  );
}

// Direct DB writes (same tables the org-chart API routes use), not HTTP
// calls — this already runs with an admin Supabase client inside the agent
// message route, so there's no auth boundary to cross like the Telegram
// direct-task-creation path needed.
//
// Treated as authoritative, not additive: every call fully replaces the
// existing connections and department assignments for this org rather than
// layering on top of them. Without this, a bad run (wrong image read,
// mismatched names) leaves stale wrong wiring that a later, correct run
// never cleans up — the chart just accumulates old-wrong + new-right data
// on top of each other, which reads as "still wrong" even after a good run.
export async function arrangeOrgChart(supabase, { organizationId, departments, connections }) {
  const { accounts } = await getAccountsWithProfiles(supabase, organizationId);
  const roster = accounts ?? [];

  const { data: existingDepartments } = await supabase
    .from("department")
    .select("department_id, department_name")
    .eq("organization_id", organizationId);

  await supabase.from("org_chart_connection").delete().eq("organization_id", organizationId);
  if (roster.length) {
    await supabase
      .from("user_account")
      .update({ department_id: null, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId);
  }

  let departmentsCreated = 0;
  let membersAssigned = 0;
  let connectionsCreated = 0;
  const unmatchedNames = new Set();

  for (const [index, department] of (departments ?? []).entries()) {
    const cleanName = (department.name ?? "").trim();
    if (!cleanName) continue;

    // Explicit order (from the document's real layout) wins; otherwise fall
    // back to list position — either way this is deterministic given the
    // same input, unlike the old "however many boundaries already exist"
    // counter, which drifted depending on what was already in the DB.
    const slot = Number.isFinite(department.order) ? department.order : index;
    const posX = slot * (DEPARTMENT_DEFAULT_WIDTH + DEPARTMENT_DEFAULT_GAP);

    let departmentRow = (existingDepartments ?? []).find(
      (existing) => normalizeName(existing.department_name) === normalizeName(cleanName),
    );

    if (!departmentRow) {
      const { data: created, error } = await supabase
        .from("department")
        .insert({ organization_id: organizationId, department_name: cleanName })
        .select("department_id, department_name")
        .single();
      if (error || !created) continue;

      departmentRow = created;
      existingDepartments?.push(created);

      await supabase.from("org_chart_department").insert({
        department_id: created.department_id,
        organization_id: organizationId,
        pos_x: posX,
        pos_y: 0,
        width: DEPARTMENT_DEFAULT_WIDTH,
        height: DEPARTMENT_DEFAULT_HEIGHT,
      });
      departmentsCreated += 1;
    } else {
      // Reposition an already-existing department too, so a re-run with an
      // explicit order always lands deterministically instead of only
      // applying to brand-new boxes.
      await supabase
        .from("org_chart_department")
        .update({ pos_x: posX, updated_at: new Date().toISOString() })
        .eq("department_id", departmentRow.department_id)
        .eq("organization_id", organizationId);
    }

    for (const memberName of department.memberNames ?? []) {
      const account = matchAccount(roster, memberName);
      if (!account) {
        unmatchedNames.add(memberName);
        continue;
      }
      const { error } = await supabase
        .from("user_account")
        .update({ department_id: departmentRow.department_id, updated_at: new Date().toISOString() })
        .eq("user_id", account.user_id);
      if (!error) membersAssigned += 1;
    }
  }

  for (const connection of connections ?? []) {
    const fromAccount = matchAccount(roster, connection.fromName);
    const toAccount = matchAccount(roster, connection.toName);
    if (!fromAccount) unmatchedNames.add(connection.fromName);
    if (!toAccount) unmatchedNames.add(connection.toName);
    if (!fromAccount || !toAccount || fromAccount.user_id === toAccount.user_id) continue;

    const { error } = await supabase.from("org_chart_connection").upsert(
      {
        organization_id: organizationId,
        from_user_id: fromAccount.user_id,
        to_user_id: toAccount.user_id,
        from_handle: HANDLE_SIDES.has(connection.fromHandle) ? connection.fromHandle : null,
        to_handle: HANDLE_SIDES.has(connection.toHandle) ? connection.toHandle : null,
      },
      { onConflict: "organization_id,from_user_id,to_user_id" },
    );
    if (!error) connectionsCreated += 1;
  }

  return { departmentsCreated, membersAssigned, connectionsCreated, unmatchedNames: [...unmatchedNames] };
}
