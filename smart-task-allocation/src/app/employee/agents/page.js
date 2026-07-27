import SideMenuLayout from "@/components/SideMenuLayout";
import AgentUnavailable from "@/components/AgentUnavailable";

export default function EmployeeAgentsPage() {
  return (
    <SideMenuLayout actor="employee">
      <AgentUnavailable />
    </SideMenuLayout>
  );
}
