import SideMenuLayout from "@/components/SideMenuLayout";
import GlassSurface from "@/components/ui/glass-surface";
import PlatformAdminDashboard from "@/components/PlatformAdminDashboard";

export default function PlatformAdminDashboardPage() {
  return (
    <SideMenuLayout actor="platformadmin">
      <GlassSurface className="h-full overflow-hidden p-6">
        <PlatformAdminDashboard />
      </GlassSurface>
    </SideMenuLayout>
  );
}
