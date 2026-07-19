"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const GRID_SIZE = 24;
const NODE_WIDTH = 150;
const NODE_HEIGHT = 138;
const BOUNDARY_PADDING_X = 50;
const BOUNDARY_PADDING_TOP = 74;
const BOUNDARY_PADDING_BOTTOM = 34;

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

function roleTier(roleName) {
  const normalized = (roleName ?? "").trim().toLowerCase();
  if (normalized === "user admin") return "ceo";
  if (normalized === "manager") return "manager";
  return "employee";
}

const HANDLE_CLASS =
  "!h-3 !w-3 !border-2 !border-white !bg-[#2563EB] transition-transform hover:!scale-125";

function PersonNode({ data }) {
  const { account } = data;
  const name = displayName(account);

  return (
    <div className="flex w-[150px] select-none flex-col items-center gap-1">
      <Handle type="source" position={Position.Top} id="top" className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Right} id="right" className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Left} id="left" className={HANDLE_CLASS} />

      <span className="relative flex h-21 w-21 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#6b7280] text-2xl font-black text-white shadow-[0_10px_22px_rgba(15,23,42,0.28)]">
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

function BoundaryNode({ data }) {
  return (
    <div
      className="pointer-events-none relative rounded-[40px] border-2 border-dashed"
      style={{ width: data.width, height: data.height, borderColor: data.border, background: data.tint }}
    >
      <span
        className="absolute left-5 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-black tracking-wide shadow-sm"
        style={{ color: data.label }}
      >
        {data.name}
      </span>
    </div>
  );
}

const NODE_TYPES = { person: PersonNode, boundary: BoundaryNode };

function computeBoundaries(accounts, personNodes) {
  const positionByUserId = new Map(personNodes.map((node) => [node.id, node.position]));
  const accountByUserId = new Map(accounts.map((account) => [account.user_id, account]));
  const departmentGroups = new Map();

  accounts.forEach((account) => {
    if (!account.department_id) return;
    const tier = roleTier(account.role?.role_name);
    if (tier === "ceo") return;

    const group = departmentGroups.get(account.department_id) ?? {
      name: account.department?.department_name ?? "Department",
      members: [],
    };
    group.members.push(account.user_id);
    departmentGroups.set(account.department_id, group);
  });

  return Array.from(departmentGroups.entries())
    .map(([departmentId, group], index) => {
      const memberPositions = group.members
        .map((userId) => positionByUserId.get(userId))
        .filter(Boolean);

      if (memberPositions.length < 1) return null;

      const minX = Math.min(...memberPositions.map((p) => p.x));
      const maxX = Math.max(...memberPositions.map((p) => p.x + NODE_WIDTH));
      const minY = Math.min(...memberPositions.map((p) => p.y));
      const maxY = Math.max(...memberPositions.map((p) => p.y + NODE_HEIGHT));

      const palette = BOUNDARY_PALETTE[index % BOUNDARY_PALETTE.length];
      const width = maxX - minX + BOUNDARY_PADDING_X * 2;
      const height = maxY - minY + BOUNDARY_PADDING_TOP + BOUNDARY_PADDING_BOTTOM;

      return {
        id: `boundary-${departmentId}`,
        type: "boundary",
        position: { x: minX - BOUNDARY_PADDING_X, y: minY - BOUNDARY_PADDING_TOP },
        draggable: false,
        selectable: false,
        connectable: false,
        zIndex: -1,
        width,
        height,
        style: { width, height },
        data: {
          name: group.name,
          width,
          height,
          border: palette.border,
          tint: palette.tint,
          label: palette.label,
        },
      };
    })
    .filter(Boolean);
}

function CanvasInner({ onAccountClick }) {
  const [accounts, setAccounts] = useState([]);
  const [personNodes, setPersonNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
  }

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
      setEdges(
        (result.connections ?? []).map((connection) => ({
          id: connection.connection_id,
          source: connection.from_user_id,
          target: connection.to_user_id,
          sourceHandle: "bottom",
          targetHandle: "top",
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

  const boundaryNodes = useMemo(
    () => computeBoundaries(accounts, personNodes),
    [accounts, personNodes],
  );

  const nodes = useMemo(() => [...boundaryNodes, ...personNodes], [boundaryNodes, personNodes]);

  const onNodesChange = useCallback((changes) => {
    setPersonNodes((current) => applyNodeChanges(changes, current));
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

  const onNodeDragStop = useCallback(async (event, node) => {
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
  }, []);

  const onConnect = useCallback(async (params) => {
    if (!params.source || !params.target || params.source === params.target) return;

    try {
      const response = await fetch("/api/org-chart/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ fromUserId: params.source, toUserId: params.target }),
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
  }, []);

  const onNodeClick = useCallback(
    (event, node) => {
      if (node.type === "person") {
        onAccountClick(node.data.account);
      }
    },
    [onAccountClick],
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
    <div className="relative h-full min-h-[560px] w-full overflow-hidden rounded-[32px] bg-[#f6f8fc]">
      {actionError ? (
        <p className="absolute left-1/2 top-4 z-10 max-w-md -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-center text-sm font-medium text-red-700 shadow-md">
          {actionError}
        </p>
      ) : null}

      <ReactFlow
        nodes={nodes}
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
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Lines} gap={GRID_SIZE} color="#E2E8F0" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-white" nodeColor="#93C5FD" />
      </ReactFlow>
    </div>
  );
}

export default function OrganizationCanvas({ onAccountClick }) {
  return (
    <ReactFlowProvider>
      <CanvasInner onAccountClick={onAccountClick} />
    </ReactFlowProvider>
  );
}
