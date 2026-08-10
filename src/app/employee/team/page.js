import SideMenuLayout from "@/components/SideMenuLayout";
import ManagerOrganizationView from "@/components/ManagerOrganizationView";
import GlassSurface from "@/components/ui/glass-surface";

export default function EmployeeTeamPage() {
  return (
    <SideMenuLayout actor="employee">
      <GlassSurface className="h-full overflow-y-auto p-2">
        <ManagerOrganizationView />
      </GlassSurface>
    </SideMenuLayout>
  );
}
