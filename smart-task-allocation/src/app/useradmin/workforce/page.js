import SideMenuLayout from "@/components/SideMenuLayout";
import GlassSurface from "@/components/ui/glass-surface";
import WorkforceOverview from "@/components/WorkforceOverview";

export default function UserAdminWorkforcePage() {
  return (
    <SideMenuLayout actor="useradmin">
      <GlassSurface className="h-full overflow-hidden p-6">
        <WorkforceOverview />
      </GlassSurface>
    </SideMenuLayout>
  );
}
