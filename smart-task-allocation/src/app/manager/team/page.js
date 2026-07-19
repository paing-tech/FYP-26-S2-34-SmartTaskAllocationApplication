import SideMenuLayout from "@/components/SideMenuLayout";
import ManagerOrganizationChart from "@/components/ManagerOrganizationChart";
import GlassSurface from "@/components/ui/glass-surface";

export default function ManagerTeamPage() {
  return (
    <SideMenuLayout actor="manager">
      <GlassSurface className="h-full overflow-y-auto p-8">
        <ManagerOrganizationChart />
      </GlassSurface>
    </SideMenuLayout>
  );
}
