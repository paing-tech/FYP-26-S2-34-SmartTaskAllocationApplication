import SideMenuLayout from "@/components/SideMenuLayout";
import AgentUnavailable from "@/components/AgentUnavailable";

export default function UserAdminAgentsPage() {
  return (
    <SideMenuLayout actor="useradmin">
      <AgentUnavailable />
    </SideMenuLayout>
  );
}
