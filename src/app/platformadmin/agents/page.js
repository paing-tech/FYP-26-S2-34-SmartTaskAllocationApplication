import { Suspense } from "react";
import SideMenuLayout from "@/components/SideMenuLayout";
import AgentWorkspace from "@/components/AgentWorkspace";

export default function PlatformAdminAgentsPage() {
  return (
    <SideMenuLayout actor="platformadmin">
      <Suspense fallback={null}>
        <AgentWorkspace />
      </Suspense>
    </SideMenuLayout>
  );
}
