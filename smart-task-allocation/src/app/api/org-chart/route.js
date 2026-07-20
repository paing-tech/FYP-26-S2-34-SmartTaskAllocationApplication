import { NextResponse } from "next/server";
import { requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getAccountsWithProfiles, getUserAccount } from "@/app/api/my-organization/route";

const NODE_SPACING_X = 200;
const TIER_SPACING_Y = 240;
const CLUSTER_GAP_X = 80;
const DEPARTMENT_DEFAULT_WIDTH = 420;
const DEPARTMENT_DEFAULT_HEIGHT = 320;
const DEPARTMENT_DEFAULT_GAP = 60;

function roleTier(roleName) {
  const normalized = (roleName ?? "").trim().toLowerCase();
  if (normalized === "user admin") return "ceo";
  if (normalized === "manager") return "manager";
  if (normalized === "employee") return "employee";
  return "employee";
}

// Lays every account out in three rows (CEO, managers, employees), grouping
// each department's manager(s) directly above that department's employees so
// the boundary box drawn around them reads as one cluster.
function computeDefaultLayout(accounts) {
  const ceoAccounts = accounts.filter((a) => roleTier(a.role?.role_name) === "ceo");
  const departmentGroups = new Map();
  const unassigned = { managers: [], employees: [] };

  accounts.forEach((account) => {
    const tier = roleTier(account.role?.role_name);
    if (tier === "ceo") return;

    const bucket = account.department_id
      ? departmentGroups.get(account.department_id) ?? { managers: [], employees: [] }
      : unassigned;

    if (tier === "manager") bucket.managers.push(account);
    else bucket.employees.push(account);

    if (account.department_id) departmentGroups.set(account.department_id, bucket);
  });

  const positions = new Map();
  let cursorX = 0;

  const placeCluster = (managers, employees) => {
    const cols = Math.max(managers.length, employees.length, 1);
    const clusterWidth = cols * NODE_SPACING_X;
    const managerStartX = cursorX + (clusterWidth - managers.length * NODE_SPACING_X) / 2;

    managers.forEach((account, index) => {
      positions.set(account.user_id, {
        pos_x: Math.round(managerStartX + index * NODE_SPACING_X),
        pos_y: TIER_SPACING_Y,
      });
    });
    employees.forEach((account, index) => {
      positions.set(account.user_id, {
        pos_x: Math.round(cursorX + index * NODE_SPACING_X),
        pos_y: TIER_SPACING_Y * 2,
      });
    });

    cursorX += clusterWidth + CLUSTER_GAP_X;
  };

  Array.from(departmentGroups.values())
    .sort((a, b) => (a.managers[0]?.department?.department_name ?? "").localeCompare(
      b.managers[0]?.department?.department_name ?? b.employees[0]?.department?.department_name ?? "",
    ))
    .forEach(({ managers, employees }) => placeCluster(managers, employees));

  if (unassigned.managers.length || unassigned.employees.length) {
    placeCluster(unassigned.managers, unassigned.employees);
  }

  const totalWidth = Math.max(cursorX - CLUSTER_GAP_X, NODE_SPACING_X);
  const ceoStartX = (totalWidth - ceoAccounts.length * NODE_SPACING_X) / 2;
  ceoAccounts.forEach((account, index) => {
    positions.set(account.user_id, {
      pos_x: Math.round(ceoStartX + index * NODE_SPACING_X),
      pos_y: 0,
    });
  });

  return positions;
}

// CEO -> every manager, and every department's manager(s) -> that
// department's employees. Only ever computed for accounts that are just now
// getting their first node (i.e. newAccounts) — an account that already has a
// node has, by definition, already had its chance at a default connection,
// so re-running this never resurrects a connection the admin deliberately
// deleted.
function computeDefaultConnectionsForNewAccounts(newAccounts, allAccounts) {
  const ceo = allAccounts.find((a) => roleTier(a.role?.role_name) === "ceo");
  const managersByDepartment = new Map();
  allAccounts
    .filter((a) => roleTier(a.role?.role_name) === "manager" && a.department_id)
    .forEach((manager) => {
      const bucket = managersByDepartment.get(manager.department_id) ?? [];
      bucket.push(manager);
      managersByDepartment.set(manager.department_id, bucket);
    });

  const connections = [];

  newAccounts.forEach((account) => {
    const tier = roleTier(account.role?.role_name);

    if (tier === "manager") {
      if (ceo) {
        connections.push({ from_user_id: ceo.user_id, to_user_id: account.user_id });
      }
      return;
    }

    if (tier === "employee" && account.department_id) {
      (managersByDepartment.get(account.department_id) ?? []).forEach((manager) => {
        connections.push({ from_user_id: manager.user_id, to_user_id: account.user_id });
      });
    }
  });

  return connections;
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getUserAccount(supabase, user);
    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }
    if (!account?.organization_id) {
      return NextResponse.json({ nodes: [], connections: [], accounts: [] });
    }

    const organizationId = account.organization_id;
    const { accounts, error: accountsError } = await getAccountsWithProfiles(supabase, organizationId);
    if (accountsError) {
      return NextResponse.json({ error: accountsError.message }, { status: 400 });
    }

    const [
      { data: existingNodes, error: nodesError },
      { data: existingConnections, error: connectionsError },
      { data: departmentRows, error: departmentsError },
      { data: existingBoundaries, error: boundariesError },
    ] = await Promise.all([
      supabase.from("org_chart_node").select("user_id, pos_x, pos_y").eq("organization_id", organizationId),
      supabase
        .from("org_chart_connection")
        .select("connection_id, from_user_id, to_user_id, from_handle, to_handle")
        .eq("organization_id", organizationId),
      supabase.from("department").select("department_id, department_name").eq("organization_id", organizationId),
      supabase
        .from("org_chart_department")
        .select("department_id, pos_x, pos_y, width, height")
        .eq("organization_id", organizationId),
    ]);

    if (nodesError) {
      return NextResponse.json({ error: nodesError.message }, { status: 400 });
    }
    if (connectionsError) {
      return NextResponse.json({ error: connectionsError.message }, { status: 400 });
    }
    if (departmentsError) {
      return NextResponse.json({ error: departmentsError.message }, { status: 400 });
    }
    if (boundariesError) {
      return NextResponse.json({ error: boundariesError.message }, { status: 400 });
    }

    const nodesByUserId = new Map((existingNodes ?? []).map((node) => [node.user_id, node]));
    const missingAccounts = accounts.filter((account) => !nodesByUserId.has(account.user_id));
    let connections = existingConnections ?? [];

    if (missingAccounts.length) {
      const layout = computeDefaultLayout(missingAccounts);

      const rowsToInsert = missingAccounts.map((account) => {
        const position = layout.get(account.user_id) ?? { pos_x: 0, pos_y: 0 };
        return { user_id: account.user_id, organization_id: organizationId, ...position };
      });

      const { data: insertedNodes, error: insertError } = await supabase
        .from("org_chart_node")
        .insert(rowsToInsert)
        .select("user_id, pos_x, pos_y");

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }

      (insertedNodes ?? []).forEach((node) => nodesByUserId.set(node.user_id, node));

      const defaultConnections = computeDefaultConnectionsForNewAccounts(missingAccounts, accounts).map(
        (connection) => ({ ...connection, organization_id: organizationId }),
      );

      if (defaultConnections.length) {
        const { data: insertedConnections, error: insertConnectionsError } = await supabase
          .from("org_chart_connection")
          .insert(defaultConnections)
          .select("connection_id, from_user_id, to_user_id, from_handle, to_handle");

        if (insertConnectionsError) {
          return NextResponse.json({ error: insertConnectionsError.message }, { status: 400 });
        }

        connections = [...connections, ...(insertedConnections ?? [])];
      }
    }

    const boundariesByDepartmentId = new Map(
      (existingBoundaries ?? []).map((boundary) => [boundary.department_id, boundary]),
    );
    const missingBoundaryDepartments = (departmentRows ?? []).filter(
      (department) => !boundariesByDepartmentId.has(department.department_id),
    );

    if (missingBoundaryDepartments.length) {
      const rowsToInsert = missingBoundaryDepartments.map((department, index) => ({
        department_id: department.department_id,
        organization_id: organizationId,
        pos_x: index * (DEPARTMENT_DEFAULT_WIDTH + DEPARTMENT_DEFAULT_GAP),
        pos_y: 0,
        width: DEPARTMENT_DEFAULT_WIDTH,
        height: DEPARTMENT_DEFAULT_HEIGHT,
      }));

      const { data: insertedBoundaries, error: insertBoundaryError } = await supabase
        .from("org_chart_department")
        .insert(rowsToInsert)
        .select("department_id, pos_x, pos_y, width, height");

      if (insertBoundaryError) {
        return NextResponse.json({ error: insertBoundaryError.message }, { status: 400 });
      }

      (insertedBoundaries ?? []).forEach((boundary) => boundariesByDepartmentId.set(boundary.department_id, boundary));
    }

    return NextResponse.json({
      accounts,
      nodes: accounts.map((account) => ({
        user_id: account.user_id,
        ...(nodesByUserId.get(account.user_id) ?? { pos_x: 0, pos_y: 0 }),
      })),
      connections,
      departments: (departmentRows ?? []).map((department) => ({
        department_id: department.department_id,
        department_name: department.department_name,
        ...(boundariesByDepartmentId.get(department.department_id) ?? {
          pos_x: 0,
          pos_y: 0,
          width: DEPARTMENT_DEFAULT_WIDTH,
          height: DEPARTMENT_DEFAULT_HEIGHT,
        }),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getUserAccount(supabase, user);
    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }
    if (!account?.organization_id) {
      return NextResponse.json({ error: "No organization to update." }, { status: 400 });
    }

    const { userId, posX, posY } = await request.json();
    if (!userId || !Number.isFinite(posX) || !Number.isFinite(posY)) {
      return NextResponse.json({ error: "userId, posX, and posY are required." }, { status: 400 });
    }

    const { error: upsertError } = await supabase.from("org_chart_node").upsert(
      {
        user_id: userId,
        organization_id: account.organization_id,
        pos_x: Math.round(posX),
        pos_y: Math.round(posY),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
