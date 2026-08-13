import SideMenuLayout from "@/components/SideMenuLayout";
import GlassSurface from "@/components/ui/glass-surface";
import FeatureFlagsManager from "@/components/FeatureFlagsManager";

export default function PlatformAdminFeaturesPage() {
  return (
    <SideMenuLayout actor="platformadmin">
      <GlassSurface className="h-full overflow-hidden py-8">
        <FeatureFlagsManager />
      </GlassSurface>
    </SideMenuLayout>
  );
}
