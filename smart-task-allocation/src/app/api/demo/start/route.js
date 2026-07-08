import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { resolveRoleIds } from "@/lib/demoServer";

const DEMO_EMAIL_DOMAIN = "optima-demo.test";

function shortId() {
  return crypto.randomUUID().slice(0, 8);
}

function demoEmail(prefix) {
  return `${prefix}-${shortId()}@${DEMO_EMAIL_DOMAIN}`;
}

// Create an auth user + user_account + profile in one go. Returns the user id.
async function createDemoAccount(supabase, { roleId, organizationId, fullName, jobTitle, departmentId, password }) {
  const email = demoEmail(fullName.split(" ")[0].toLowerCase());
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: password ?? crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: fullName, demo: true, demo_org: organizationId },
  });
  if (createError || !created?.user?.id) {
    throw new Error(createError?.message || "Could not create demo account.");
  }
  const userId = created.user.id;

  const username = `${fullName.split(" ")[0].toLowerCase()}_${shortId()}`;
  const { error: accountError } = await supabase.from("user_account").insert({
    user_id: userId,
    role_id: roleId,
    organization_id: organizationId,
    department_id: departmentId ?? null,
    username,
    email,
    account_status: "Active",
  });
  if (accountError) {
    await supabase.auth.admin.deleteUser(userId);
    throw new Error(accountError.message);
  }

  await supabase.from("profile").insert({
    profile_id: crypto.randomUUID(),
    user_id: userId,
    full_name: fullName,
    job_title: jobTitle ?? null,
  });

  return { userId, email };
}

// This week's Monday at 09:00, used to anchor availability / work-log seeds.
function mondayThisWeek() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(9, 0, 0, 0);
  return monday;
}

function atDay(base, dayOffset, hour) {
  const d = new Date(base);
  d.setDate(base.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const EMPLOYEE_SEED = [
  {
    fullName: "Amelia Brooks",
    jobTitle: "Frontend Developer",
    skills: [["React", "5"], ["Next.js", "4"], ["CSS", "3"]],
    days: [0, 1, 3],
  },
  {
    fullName: "Liam Carter",
    jobTitle: "Backend Engineer",
    skills: [["Node.js", "4"], ["PostgreSQL", "5"], ["Python", "3"]],
    days: [0, 2, 4],
  },
  {
    fullName: "Sophia Nguyen",
    jobTitle: "Product Designer",
    skills: [["Figma", "5"], ["UX Research", "4"], ["Prototyping", "2"]],
    days: [1, 2, 3],
  },
  {
    fullName: "Noah Patel",
    jobTitle: "QA Engineer",
    skills: [["Test Automation", "4"], ["Cypress", "3"], ["Python", "2"]],
    days: [0, 1, 4],
  },
];

const WORKSPACE_SEED = [
  {
    name: "Product Launch",
    groups: [
      { name: "To Do", tasks: ["Define launch checklist", "Draft press release", "Plan beta rollout"] },
      { name: "In Progress", tasks: ["Build landing page", "Set up analytics"] },
      { name: "Done", tasks: ["Finalize pricing tiers"] },
    ],
  },
  {
    name: "Website Revamp",
    groups: [
      { name: "To Do", tasks: ["Audit current site", "Collect design references"] },
      { name: "In Progress", tasks: ["Redesign homepage", "Migrate blog content"] },
      { name: "Done", tasks: ["Pick component library"] },
    ],
  },
];

export async function POST() {
  const supabase = getSupabaseAdminClient();
  const createdUserIds = [];
  let organizationId = null;

  try {
    const roleIds = await resolveRoleIds(supabase);
    if (!roleIds.manager || !roleIds.useradmin || !roleIds.employee) {
      return NextResponse.json(
        { error: "Demo roles are not configured (need User Admin, Manager, Employee)." },
        { status: 400 },
      );
    }

    // 1. Organization
    organizationId = crypto.randomUUID();
    const orgCode = `DEMO-${shortId().toUpperCase()}`;
    const { error: orgError } = await supabase.from("organization").insert({
      organization_id: organizationId,
      organization_name: "Optima Demo Co.",
      organization_code: orgCode,
      organization_email: `org-${shortId()}@${DEMO_EMAIL_DOMAIN}`,
      organization_type: "Demo",
    });
    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 400 });
    }

    // 2. Department
    const { data: department } = await supabase
      .from("department")
      .insert({ organization_id: organizationId, department_name: "Engineering" })
      .select("department_id")
      .single();
    const departmentId = department?.department_id ?? null;

    // 3. Guest account (default Manager) with a known password to sign in.
    const guestPassword = crypto.randomUUID();
    const guest = await createDemoAccount(supabase, {
      roleId: roleIds.manager,
      organizationId,
      fullName: "Guest User",
      jobTitle: "Manager",
      departmentId,
      password: guestPassword,
    });
    createdUserIds.push(guest.userId);

    // 4. Seeded employees + their skills, availability and work logs.
    const monday = mondayThisWeek();
    const employees = [];
    const skillCache = new Map();

    async function resolveSkillId(name) {
      if (skillCache.has(name)) return skillCache.get(name);
      await supabase.from("skill").upsert({ skill_name: name }, { onConflict: "skill_name" });
      const { data: skill } = await supabase
        .from("skill")
        .select("skill_id")
        .eq("skill_name", name)
        .maybeSingle();
      const id = skill?.skill_id ?? null;
      skillCache.set(name, id);
      return id;
    }

    for (const seed of EMPLOYEE_SEED) {
      const created = await createDemoAccount(supabase, {
        roleId: roleIds.employee,
        organizationId,
        fullName: seed.fullName,
        jobTitle: seed.jobTitle,
        departmentId,
      });
      createdUserIds.push(created.userId);
      employees.push({ ...created, seed });

      // Skills.
      for (const [skillName] of seed.skills) {
        const skillId = await resolveSkillId(skillName);
        if (skillId != null) {
          await supabase.from("user_skill").insert({
            user_id: created.userId,
            skill_id: skillId,
          });
        }
      }

      // Availability windows this week (9:00–17:00 on the seeded days).
      const availabilityRows = seed.days.map((day) => ({
        user_id: created.userId,
        availability_start: atDay(monday, day, 9),
        availability_end: atDay(monday, day, 17),
        status: "Available",
      }));
      await supabase.from("availability").insert(availabilityRows);

      // Work logs this week (a couple of clocked shifts → real worked hours).
      const workRows = seed.days.slice(0, 2).map((day) => ({
        user_id: created.userId,
        clock_in_at: atDay(monday, day, 9),
        clock_out_at: atDay(monday, day, 13),
        status: "Clocked Out",
      }));
      await supabase.from("work_log").insert(workRows);
    }

    // 5. Team with the guest as owner and employees as members.
    const { data: team } = await supabase
      .from("team")
      .insert({ organization_id: organizationId, team_name: "Core Team", created_by: guest.userId })
      .select("team_id")
      .single();
    if (team?.team_id != null) {
      await supabase.from("team_member").insert([
        { team_id: team.team_id, user_id: guest.userId, team_role: "Owner" },
        ...employees.map((emp) => ({
          team_id: team.team_id,
          user_id: emp.userId,
          team_role: "Member",
        })),
      ]);
    }

    // 6. Workspaces, groups, tasks, assignments.
    let taskCounter = 0;
    for (const wsSeed of WORKSPACE_SEED) {
      const workspaceId = crypto.randomUUID();
      await supabase.from("workspace").insert({
        workspace_id: workspaceId,
        workspace_name: wsSeed.name,
        created_by: guest.userId,
        status: "Active",
        visibility: "Private",
      });
      await supabase.from("workspace_member").insert([
        { workspace_id: workspaceId, user_id: guest.userId },
        ...employees.map((emp) => ({ workspace_id: workspaceId, user_id: emp.userId })),
      ]);

      let sortOrder = 0;
      for (const groupSeed of wsSeed.groups) {
        const { data: group } = await supabase
          .from("task_group")
          .insert({ workspace_id: workspaceId, group_name: groupSeed.name, sort_order: sortOrder++ })
          .select("group_id")
          .single();
        const groupId = group?.group_id ?? null;

        for (const title of groupSeed.tasks) {
          // Rotate assignees; give the guest a couple so the Employee view
          // (which shows tasks assigned to the signed-in user) has content.
          const assignee = taskCounter % 3 === 0 ? guest : employees[taskCounter % employees.length];
          const status =
            groupSeed.name === "Done" ? "Completed" : groupSeed.name === "In Progress" ? "In Progress" : "Open";

          const { data: task } = await supabase
            .from("task")
            .insert({
              organization_id: organizationId,
              group_id: groupId,
              workspace_id: workspaceId,
              title,
              owner_id: guest.userId,
              assigned_to: assignee.userId,
              status,
              priority: ["Low", "Medium", "High"][taskCounter % 3],
              start_datetime: atDay(monday, taskCounter % 5, 9),
              end_datetime: atDay(monday, (taskCounter % 5) + 1, 17),
              sort_order: taskCounter,
            })
            .select("task_id")
            .single();

          if (task?.task_id != null) {
            await supabase.from("task_assignment").insert({
              task_id: task.task_id,
              user_id: assignee.userId,
              assigned_by: taskCounter % 4 === 0 ? "Optimus AI" : "Guest User",
              status: "Assigned",
            });
          }
          taskCounter += 1;
        }
      }
    }

    return NextResponse.json({
      success: true,
      email: guest.email,
      password: guestPassword,
      organizationId,
    });
  } catch (error) {
    // Best-effort rollback so a failed provision doesn't leave orphans.
    try {
      if (organizationId) {
        await supabase.from("organization").delete().eq("organization_id", organizationId);
      }
      for (const userId of createdUserIds) {
        await supabase.auth.admin.deleteUser(userId).catch(() => {});
      }
    } catch {
      /* ignore cleanup failures */
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
