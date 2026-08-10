import { Suspense } from "react";
import SideMenuLayout from "@/components/SideMenuLayout";
import AgentWorkspace from "@/components/AgentWorkspace";

export default function ManagerAgentsPage() {
  return (
    <SideMenuLayout actor="manager">
      <Suspense fallback={null}>
        <AgentWorkspace />
      </Suspense>
    </SideMenuLayout>
  );
}
