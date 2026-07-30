import { Suspense } from "react";
import SideMenuLayout from "@/components/SideMenuLayout";
import AgentWorkspace from "@/components/AgentWorkspace";

export default function EmployeeAgentsPage() {
  return (
    <SideMenuLayout actor="employee">
      <Suspense fallback={null}>
        <AgentWorkspace />
      </Suspense>
    </SideMenuLayout>
  );
}
