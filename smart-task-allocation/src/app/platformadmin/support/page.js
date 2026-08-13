import SideMenuLayout from "@/components/SideMenuLayout";
import GlassSurface from "@/components/ui/glass-surface";
import PlatformAdminSupport from "@/components/PlatformAdminSupport";

export default function PlatformAdminSupportPage() {
  return (
    <SideMenuLayout actor="platformadmin">
      <GlassSurface className="h-full overflow-hidden p-6">
        <PlatformAdminSupport />
      </GlassSurface>
    </SideMenuLayout>
  );
}
