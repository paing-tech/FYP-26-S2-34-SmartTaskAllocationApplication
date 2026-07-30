import { Suspense } from "react";
import SideMenuLayout from "@/components/SideMenuLayout";
import AgentWorkspace from "@/components/AgentWorkspace";

export default function UserAdminAgentsPage() {
  return (
    <SideMenuLayout actor="useradmin">
      <Suspense fallback={null}>
        <AgentWorkspace />
      </Suspense>
    </SideMenuLayout>
  );
}
