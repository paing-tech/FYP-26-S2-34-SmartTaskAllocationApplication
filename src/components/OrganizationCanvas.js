"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  Handle,
  Position,
  MarkerType,
  NodeResizer,
  useConnection,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const GRID_SIZE = 26;
const NODE_WIDTH = 150;
const NODE_HEIGHT = 138;
const AVATAR_SIZE = 84;
const AVATAR_SIDE_OFFSET = (NODE_WIDTH - AVATAR_SIZE) / 2;
const AVATAR_CENTER_Y = AVATAR_SIZE / 2;
const DEPARTMENT_NODE_PREFIX = "department-";
const DEPARTMENT_DEFAULT_WIDTH = 420;
const DEPARTMENT_DEFAULT_HEIGHT = 320;

const BOUNDARY_PALETTE = [
  { border: "#93C5FD", tint: "rgba(191,227,255,0.28)", label: "#1E3A8A" },
  { border: "#86EFAC", tint: "rgba(201,243,216,0.28)", label: "#14532D" },
  { border: "#FCD34D", tint: "rgba(255,225,184,0.28)", label: "#78350F" },
  { border: "#D8B4FE", tint: "rgba(243,210,255,0.28)", label: "#581C87" },
  { border: "#FDA4AF", tint: "rgba(255,211,217,0.28)", label: "#881337" },
  { border: "#A5B4FC", tint: "rgba(217,226,255,0.28)", label: "#312E81" },
];

function initialFromName(name) {
  return (name || "User").trim().charAt(0).toUpperCase() || "U";
}

function displayName(account) {
  return account.full_name || account.username || account.email || "User";
}

const ConnectingContext = createContext(false);

function handleClass(isConnecting) {
  const base = "!h-3 !w-3 !border-2 !border-white !bg-[#2563EB] transition-all hover:!scale-125";
  return isConnecting ? `${base} !opacity-100` : `${base} !opacity-0 group-hover:!opacity-100`;
}

function PersonNode({ data }) {
  const { account } = data;
  const name = displayName(account);
  const isConnecting = useContext(ConnectingContext);

  return (
    <div className="group flex w-[150px] select-none flex-col items-center gap-1">
      <Handle type="source" position={Position.Top} id="top" className={handleClass(isConnecting)} />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className={handleClass(isConnecting)}
        style={{
          top: AVATAR_CENTER_Y,
          left: NODE_WIDTH - AVATAR_SIDE_OFFSET,
          right: "auto",
          transform: "translate(-50%, -50%)",
        }}
      />
      <Handle type="source" position={Position.Bottom} id="bottom" className={handleClass(isConnecting)} />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className={handleClass(isConnecting)}
        style={{ top: AVATAR_CENTER_Y, left: AVATAR_SIDE_OFFSET, transform: "translate(-50%, -50%)" }}
      />

      <span className="relative flex h-21 w-21 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#6b7280] text-2xl font-black text-white shadow-[0_10px_22px_rgba(15,23,42,0.28)]">
        {account.profile_picture_url ? (
          <Image src={account.profile_picture_url} alt="" fill sizes="84px" className="object-cover" />
        ) : (
          initialFromName(name)
        )}
      </span>

      <span className="mt-1 max-w-[150px] truncate text-center text-sm font-bold text-[#0D1E4C]">
        {name}
      </span>
      {account.job_title ? (
        <span className="max-w-[150px] truncate text-center text-xs font-medium text-[#667085]">
          {account.job_title}
        </span>
      ) : null}
    </div>
  );
}

function BoundaryNode({ data, selected }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(data.name);

  function commitRename() {
    setIsEditing(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== data.name) {
      data.onRename(trimmed);
    } else {
      setDraftName(data.name);
    }
  }

  return (
    <div
      className="relative rounded-[40px] border-2 border-dashed"
      style={{ width: data.width, height: data.height, borderColor: data.border, background: data.tint }}
    >
      <NodeResizer
        minWidth={220}
        minHeight={160}
        isVisible={selected}
        lineClassName="!border-transparent"
        handleClassName="!h-3 !w-3 !rounded-sm !border-2 !border-white !bg-[#2563EB]"
        onResizeEnd={(event, params) => data.onResizeEnd(params)}
      />

      {isEditing ? (
        <input
          autoFocus
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitRename();
            if (event.key === "Escape") {
              setDraftName(data.name);
              setIsEditing(false);
            }
          }}
          className="nodrag absolute left-1/2 top-4 max-w-[75%] -translate-x-1/2 rounded-full border border-black/10 bg-white px-4 py-1.5 text-center text-lg font-black tracking-wide shadow-sm outline-none"
          style={{ color: data.label }}
        />
      ) : (
        <button
          type="button"
          disabled={data.isLocked}
          onClick={() => {
            if (data.isLocked) return;
            setDraftName(data.name);
            setIsEditing(true);
          }}
          className={`nodrag absolute left-1/2 top-4 max-w-[75%] -translate-x-1/2 truncate rounded-full bg-white/90 px-4 py-1.5 text-center text-lg font-black tracking-wide shadow-sm ${
            data.isLocked ? "cursor-default" : ""
          }`}
          style={{ color: data.label }}
        >
          {data.name}
        </button>
      )}
    </div>
  );
}

const ORGANIZATION_DETAIL_FIELDS = [
  { field: "organization_code", label: "Code" },
  { field: "organization_email", label: "Email" },
  { field: "organization_type", label: "Industry" },
  { field: "logo_url", label: "Logo URL" },
];

function draftFromOrganization(organization) {
  return {
    organization_name: organization.organization_name ?? "",
    organization_code: organization.organization_code ?? "",
    organization_email: organization.organization_email ?? "",
    organization_type: organization.organization_type ?? "",
    logo_url: organization.logo_url ?? "",
  };
}

function OrganizationDetailsPanel({ organization, onUpdate, disabled }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [draft, setDraft] = useState(() => draftFromOrganization(organization));

  function updateDraftField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function enterEditMode() {
    setDraft(draftFromOrganization(organization));
    setIsEditMode(true);
  }

  function saveAndExitEditMode() {
    setIsEditMode(false);
    const hasChanges = Object.keys(draft).some(
      (field) => draft[field].trim() !== (organization[field] ?? ""),
    );
    if (hasChanges) {
      onUpdate(Object.fromEntries(Object.entries(draft).map(([field, value]) => [field, value.trim()])));
    }
  }

  return (
    <div className="w-72 rounded-3xl bg-white/95 p-4 shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#6b7280] text-sm font-bold text-white">
          {organization.logo_url ? (
            <Image src={organization.logo_url} alt="" fill sizes="40px" className="object-cover" />
          ) : (
            initialFromName(organization.organization_name)
          )}
        </span>

        {isEditMode ? (
          <input
            autoFocus
            value={draft.organization_name}
            onChange={(event) => updateDraftField("organization_name", event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-black/10 px-2 py-1 text-lg font-bold text-[#1E40AF] outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-lg font-bold text-[#1E40AF]">
            {organization.organization_name || "Untitled organization"}
          </span>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={isEditMode ? saveAndExitEditMode : enterEditMode}
          className="shrink-0 rounded-full p-1.5 text-[#667085] hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label={isEditMode ? "Save organization details" : "Edit organization details"}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "22px" }} aria-hidden="true">
            {isEditMode ? "edit_off" : "edit_square"}
          </span>
        </button>
      </div>

      <div className="mt-3 space-y-2 border-t border-black/10 pt-3">
        {ORGANIZATION_DETAIL_FIELDS.map(({ field, label }) => (
          <div key={field}>
            <span className="block px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              {label}
            </span>
            {isEditMode ? (
              <input
                value={draft[field]}
                onChange={(event) => updateDraftField(field, event.target.value)}
                className="w-full rounded-md border border-black/10 px-2 py-1 text-sm text-[#0D1E4C] outline-none"
              />
            ) : (
              <p className="truncate px-2 py-1 text-sm text-[#0D1E4C]">{organization[field] || "—"}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const KEY_TRACK_WIDTH = 68;
const KEY_MAX_DRAG = 26;

function LockToggle({ lockState, onRequestUnlock, onRelock }) {
  const restingDragX = lockState === "locked" ? 0 : KEY_MAX_DRAG;
  const [dragX, setDragX] = useState(restingDragX);
  const [isDragging, setIsDragging] = useState(false);
  const [syncedLockState, setSyncedLockState] = useState(lockState);
  const dragStartRef = useRef({ pointerX: 0, startDragX: 0 });
  const dragXRef = useRef(dragX);

  function updateDragX(value) {
    dragXRef.current = value;
    setDragX(value);
  }

  if (lockState !== syncedLockState) {
    setSyncedLockState(lockState);
    if (!isDragging) {
      setDragX(restingDragX);
    }
  }

  useEffect(() => {
    dragXRef.current = dragX;
  }, [dragX]);

  useEffect(() => {
    if (!isDragging) return undefined;

    function handleMove(event) {
      const delta = event.clientX - dragStartRef.current.pointerX;
      const next = Math.min(KEY_MAX_DRAG, Math.max(0, dragStartRef.current.startDragX + delta));
      updateDragX(next);
    }

    function handleUp() {
      setIsDragging(false);
      const current = dragXRef.current;
      const threshold = KEY_MAX_DRAG * 0.55;
      if (lockState === "locked" && current >= threshold) {
        updateDragX(KEY_MAX_DRAG);
        onRequestUnlock();
      } else if (lockState !== "locked" && current <= KEY_MAX_DRAG - threshold) {
        updateDragX(0);
        onRelock();
      } else {
        updateDragX(lockState === "locked" ? 0 : KEY_MAX_DRAG);
      }
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [isDragging, lockState, onRequestUnlock, onRelock]);

  function handlePointerDown(event) {
    event.preventDefault();
    dragStartRef.current = { pointerX: event.clientX, startDragX: dragXRef.current };
    setIsDragging(true);
  }

  const showUnlockIcon = lockState !== "locked" || dragX > KEY_MAX_DRAG / 2;

  return (
    <div className="relative h-7 shrink-0" style={{ width: KEY_TRACK_WIDTH }}>
      <span
        onPointerDown={handlePointerDown}
        className="absolute top-1/2 z-0 flex -translate-y-1/2 cursor-grab select-none items-center text-[#1E40AF] active:cursor-grabbing"
        style={{ left: dragX, transition: isDragging ? "none" : "left 150ms ease" }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: "30px" }} aria-hidden="true">
          key
        </span>
      </span>
      <span className="absolute right-0 top-1/2 z-10 -translate-y-1/2 text-[#1E40AF]">
        <span className="material-symbols-outlined" style={{ fontSize: "30px" }} aria-hidden="true">
          {showUnlockIcon ? "lock_open_right" : "lock"}
        </span>
      </span>
    </div>
  );
}

function PasswordPanel({ onSubmit, onCancel, isSubmitting, error }) {
  const [password, setPassword] = useState("");

  return (
    <div className="w-64 rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur-sm">
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit(password);
          if (event.key === "Escape") onCancel();
        }}
        placeholder="Enter password"
        className="w-full rounded-md border border-black/10 px-3 py-2 text-sm text-[#0D1E4C] outline-none"
      />
      {error ? <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p> : null}
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1 text-xs font-bold text-[#667085] hover:bg-black/5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(password)}
          disabled={isSubmitting || !password}
          className="rounded-full bg-[#2563EB] px-3 py-1 text-xs font-bold text-white transition hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Checking..." : "Unlock"}
        </button>
      </div>
    </div>
  );
}

function CanvasControls({ onAddDepartment, isLocked }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="flex items-end gap-4">
      <div className="flex flex-col gap-1 rounded-xl bg-white p-1 shadow-md">
        <button
          type="button"
          onClick={() => zoomIn()}
          aria-label="Zoom in"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-base font-bold text-[#0D1E4C] hover:bg-black/5"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomOut()}
          aria-label="Zoom out"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-base font-bold text-[#0D1E4C] hover:bg-black/5"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => fitView()}
          aria-label="Fit view"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[#0D1E4C] hover:bg-black/5"
        >
          <span className="block h-2.5 w-2.5 rounded-[2px] border-2 border-current" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={onAddDepartment}
        disabled={isLocked}
        className="flex h-25 w-30 flex-col items-center justify-center gap-1 rounded-xl transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="h-14 w-24 rounded-xl border-2 border-black" aria-hidden="true" />
        <span className="text-[12px] font-bold text-black">Add department</span>
      </button>
    </div>
  );
}

const NODE_TYPES = { person: PersonNode, boundary: BoundaryNode };

function buildDepartmentNode(department, index) {
  const palette = BOUNDARY_PALETTE[index % BOUNDARY_PALETTE.length];
  const width = department.width ?? DEPARTMENT_DEFAULT_WIDTH;
  const height = department.height ?? DEPARTMENT_DEFAULT_HEIGHT;

  return {
    id: `${DEPARTMENT_NODE_PREFIX}${department.department_id}`,
    type: "boundary",
    position: { x: department.pos_x ?? 0, y: department.pos_y ?? 0 },
    draggable: true,
    selectable: true,
    connectable: false,
    zIndex: -1,
    width,
    height,
    style: { width, height },
    data: {
      departmentId: department.department_id,
      name: department.department_name,
      width,
      height,
      border: palette.border,
      tint: palette.tint,
      label: palette.label,
    },
  };
}

function CanvasInner({ organization, onAccountClick, onUpdateOrganization, readOnly = false }) {
  const [accounts, setAccounts] = useState([]);
  const [personNodes, setPersonNodes] = useState([]);
  const [departmentNodes, setDepartmentNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [lockState, setLockState] = useState("locked");
  const [passwordError, setPasswordError] = useState("");
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const isConnectionInProgress = useConnection((c) => c.inProgress);
  // readOnly forces locked regardless of lockState — no password re-auth can
  // ever flip it, since the underlying write APIs are User-Admin-only
  // anyway; letting a manager "unlock" client-side would just make every
  // subsequent edit action fail with a confusing 403 instead of being
  // honestly unavailable.
  const isLocked = readOnly || lockState !== "unlocked";

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
  }

  const handleRequestUnlock = useCallback(() => {
    setPasswordError("");
    setLockState("awaiting-password");
  }, []);

  const handleRelock = useCallback(() => {
    setPasswordError("");
    setLockState("locked");
  }, []);

  const handlePasswordCancel = useCallback(() => {
    setPasswordError("");
    setLockState("locked");
  }, []);

  const handlePasswordSubmit = useCallback(async (password) => {
    setIsVerifyingPassword(true);
    setPasswordError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email;
      if (!email) {
        throw new Error("Could not verify your account.");
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error("Incorrect password.");
      }
      setLockState("unlocked");
    } catch (verifyError) {
      setPasswordError(verifyError.message);
    } finally {
      setIsVerifyingPassword(false);
    }
  }, []);

  const loadChart = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/org-chart", { headers: await authHeaders() });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not load organization chart.");
      }

      const accountByUserId = new Map((result.accounts ?? []).map((a) => [a.user_id, a]));
      setAccounts(result.accounts ?? []);
      setPersonNodes(
        (result.nodes ?? [])
          .filter((node) => accountByUserId.has(node.user_id))
          .map((node) => ({
            id: node.user_id,
            type: "person",
            position: { x: node.pos_x, y: node.pos_y },
            data: { account: accountByUserId.get(node.user_id) },
          })),
      );
      setDepartmentNodes((result.departments ?? []).map(buildDepartmentNode));
      setEdges(
        (result.connections ?? []).map((connection) => ({
          id: connection.connection_id,
          source: connection.from_user_id,
          target: connection.to_user_id,
          sourceHandle: connection.from_handle ?? "bottom",
          targetHandle: connection.to_handle ?? "top",
          type: "default",
          style: { stroke: "#94A3B8", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#94A3B8" },
        })),
      );
    } catch (caughtError) {
      setLoadError(caughtError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(loadChart, 0);
    return () => clearTimeout(timeout);
  }, [loadChart]);

  const nodes = useMemo(() => [...departmentNodes, ...personNodes], [departmentNodes, personNodes]);

  const onNodesChange = useCallback((changes) => {
    const boundaryChanges = changes.filter((change) => String(change.id).startsWith(DEPARTMENT_NODE_PREFIX));
    const personChanges = changes.filter(
      (change) => !String(change.id).startsWith(DEPARTMENT_NODE_PREFIX) && change.type !== "remove",
    );

    if (personChanges.length) {
      setPersonNodes((current) => applyNodeChanges(personChanges, current));
    }
    if (boundaryChanges.length) {
      setDepartmentNodes((current) => applyNodeChanges(boundaryChanges, current));
    }

    boundaryChanges
      .filter((change) => change.type === "remove")
      .forEach(async (change) => {
        const departmentId = Number(change.id.slice(DEPARTMENT_NODE_PREFIX.length));
        try {
          await fetch("/api/org-chart/departments", {
            method: "DELETE",
            headers: { "Content-Type": "application/json", ...(await authHeaders()) },
            body: JSON.stringify({ departmentId }),
          });
        } catch {
          // best-effort; a stale row can be cleaned up on next load
        }
      });
  }, []);

  const onEdgesChange = useCallback((changes) => {
    const removed = changes.filter((change) => change.type === "remove");
    setEdges((current) => applyEdgeChanges(changes, current));

    removed.forEach(async (change) => {
      try {
        await fetch("/api/org-chart/connections", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ connectionId: change.id }),
        });
      } catch {
        // best-effort; a stale connection can be cleaned up on next load
      }
    });
  }, []);

  const assignPersonToContainingDepartment = useCallback(
    async (personNode) => {
      const centerX = personNode.position.x + NODE_WIDTH / 2;
      const centerY = personNode.position.y + NODE_HEIGHT / 2;

      const containing = departmentNodes.find(
        (dept) =>
          centerX >= dept.position.x &&
          centerX <= dept.position.x + dept.width &&
          centerY >= dept.position.y &&
          centerY <= dept.position.y + dept.height,
      );
      if (!containing) return;

      const account = accounts.find((a) => a.user_id === personNode.id);
      if (!account || account.department_id === containing.data.departmentId) return;

      try {
        const response = await fetch("/api/my-organization", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({
            action: "assignDepartment",
            userId: personNode.id,
            departmentId: containing.data.departmentId,
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Could not assign department.");
        }

        setAccounts((current) =>
          current.map((a) =>
            a.user_id === personNode.id ? { ...a, department_id: containing.data.departmentId } : a,
          ),
        );
      } catch (assignError) {
        setActionError(assignError.message);
      }
    },
    [departmentNodes, accounts],
  );

  const onNodeDragStop = useCallback(
    async (event, node) => {
      if (isLocked) return;

      if (node.type === "boundary") {
        try {
          await fetch("/api/org-chart/departments", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...(await authHeaders()) },
            body: JSON.stringify({
              departmentId: node.data.departmentId,
              posX: node.position.x,
              posY: node.position.y,
            }),
          });
        } catch (saveError) {
          setActionError(saveError.message);
        }
        return;
      }

      if (node.type !== "person") return;

      try {
        await fetch("/api/org-chart", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ userId: node.id, posX: node.position.x, posY: node.position.y }),
        });
      } catch (saveError) {
        setActionError(saveError.message);
      }

      assignPersonToContainingDepartment(node);
    },
    [isLocked, assignPersonToContainingDepartment],
  );

  const onConnect = useCallback(async (params) => {
    if (isLocked) return;
    if (!params.source || !params.target || params.source === params.target) return;

    try {
      const response = await fetch("/api/org-chart/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          fromUserId: params.source,
          toUserId: params.target,
          fromHandle: params.sourceHandle,
          toHandle: params.targetHandle,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not create connection.");
      }

      setEdges((current) => [
        ...current.filter(
          (edge) => !(edge.source === params.source && edge.target === params.target),
        ),
        {
          id: result.connection.connection_id,
          source: params.source,
          target: params.target,
          sourceHandle: params.sourceHandle,
          targetHandle: params.targetHandle,
          type: "default",
          style: { stroke: "#94A3B8", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#94A3B8" },
        },
      ]);
    } catch (connectError) {
      setActionError(connectError.message);
    }
  }, [isLocked]);

  const onNodeClick = useCallback(
    (event, node) => {
      if (node.type === "person") {
        onAccountClick(node.data.account);
      }
    },
    [onAccountClick],
  );

  const handleAddDepartment = useCallback(async () => {
    if (isLocked) return;
    try {
      const index = departmentNodes.length;
      const response = await fetch("/api/org-chart/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          posX: (index % 4) * (DEPARTMENT_DEFAULT_WIDTH + 40),
          posY: Math.floor(index / 4) * (DEPARTMENT_DEFAULT_HEIGHT + 40),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not add department.");
      }

      setDepartmentNodes((current) => [...current, buildDepartmentNode(result.department, current.length)]);
    } catch (addError) {
      setActionError(addError.message);
    }
  }, [isLocked, departmentNodes.length]);

  const handleBoundaryRename = useCallback(async (departmentId, newName) => {
    setDepartmentNodes((current) =>
      current.map((n) =>
        n.data.departmentId === departmentId ? { ...n, data: { ...n.data, name: newName } } : n,
      ),
    );
    try {
      const response = await fetch("/api/org-chart/departments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ departmentId, name: newName }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not rename department.");
      }
    } catch (renameError) {
      setActionError(renameError.message);
    }
  }, []);

  const handleBoundaryResizeEnd = useCallback(async (departmentId, params) => {
    setDepartmentNodes((current) =>
      current.map((n) =>
        n.data.departmentId === departmentId
          ? {
              ...n,
              position: { x: params.x, y: params.y },
              width: params.width,
              height: params.height,
              style: { width: params.width, height: params.height },
              data: { ...n.data, width: params.width, height: params.height },
            }
          : n,
      ),
    );
    try {
      const response = await fetch("/api/org-chart/departments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          departmentId,
          posX: params.x,
          posY: params.y,
          width: params.width,
          height: params.height,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not resize department.");
      }
    } catch (resizeError) {
      setActionError(resizeError.message);
    }
  }, []);

  const nodesWithCallbacks = useMemo(
    () =>
      nodes.map((node) =>
        node.type === "boundary"
          ? {
              ...node,
              draggable: !isLocked,
              selectable: !isLocked,
              data: {
                ...node.data,
                isLocked,
                onRename: (newName) => handleBoundaryRename(node.data.departmentId, newName),
                onResizeEnd: (params) => handleBoundaryResizeEnd(node.data.departmentId, params),
              },
            }
          : node,
      ),
    [nodes, isLocked, handleBoundaryRename, handleBoundaryResizeEnd],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-semibold text-[#52627a]">
        Loading organization chart...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="max-w-md rounded-md border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700">
          {loadError}
        </p>
      </div>
    );
  }

  if (!accounts.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-semibold text-[#52627a]">
        No accounts to show yet.
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[560px] w-full overflow-hidden rounded-[32px] bg-white/80 backdrop-blur-md">
      {actionError ? (
        <p className="absolute left-1/2 top-4 z-10 max-w-md -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-center text-sm font-medium text-red-700 shadow-md">
          {actionError}
        </p>
      ) : null}

      <ConnectingContext.Provider value={isConnectionInProgress}>
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          connectionMode="loose"
          snapToGrid
          snapGrid={[GRID_SIZE, GRID_SIZE]}
          defaultEdgeOptions={{ type: "default" }}
          nodesDraggable={!isLocked}
          nodesConnectable={!isLocked}
          elementsSelectable={!isLocked}
          deleteKeyCode={isLocked ? [] : ["Backspace", "Delete"]}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Lines} gap={GRID_SIZE} color="#E2E8F0" />
          <MiniMap pannable zoomable className="!bg-white" nodeColor="#93C5FD" />
          {organization ? (
            <Panel position="top-left">
              <OrganizationDetailsPanel
                organization={organization}
                onUpdate={onUpdateOrganization}
                disabled={isLocked}
              />
            </Panel>
          ) : null}
          <Panel position="top-right">
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-3 rounded-full border border-white/65 bg-white/20 px-4 py-4 shadow-md backdrop-blur-sm">
                <span className="text-lg font-bold text-black">Organization Chart</span>
                {readOnly ? (
                  <span className="rounded-full bg-black/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-black/60">
                    View only
                  </span>
                ) : (
                  <LockToggle
                    lockState={lockState}
                    onRequestUnlock={handleRequestUnlock}
                    onRelock={handleRelock}
                  />
                )}
              </div>
              {!readOnly && lockState === "awaiting-password" ? (
                <PasswordPanel
                  onSubmit={handlePasswordSubmit}
                  onCancel={handlePasswordCancel}
                  isSubmitting={isVerifyingPassword}
                  error={passwordError}
                />
              ) : null}
            </div>
          </Panel>
          <Panel position="bottom-left">
            <CanvasControls onAddDepartment={handleAddDepartment} isLocked={isLocked} />
          </Panel>
        </ReactFlow>
      </ConnectingContext.Provider>
    </div>
  );
}

export default function OrganizationCanvas({ organization, onAccountClick, onUpdateOrganization, readOnly = false }) {
  return (
    <ReactFlowProvider>
      <CanvasInner
        organization={organization}
        onAccountClick={onAccountClick}
        onUpdateOrganization={onUpdateOrganization}
        readOnly={readOnly}
      />
    </ReactFlowProvider>
  );
}
