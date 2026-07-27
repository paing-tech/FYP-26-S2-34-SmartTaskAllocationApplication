import SideMenuLayout from "@/components/SideMenuLayout";
import AgentUnavailable from "@/components/AgentUnavailable";

export default function PlatformAdminAgentsPage() {
  return (
    <SideMenuLayout actor="platformadmin">
      <AgentUnavailable />
    </SideMenuLayout>
  );
}
