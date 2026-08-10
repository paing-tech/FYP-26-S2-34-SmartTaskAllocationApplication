import SideMenuLayout from "@/components/SideMenuLayout";
import WorkspaceView from "@/components/WorkspaceView";
import GlassSurface from "@/components/ui/glass-surface";

export default function ManagerWorkspacePage() {
  return (
    <SideMenuLayout actor="manager">
      <GlassSurface className="h-full overflow-hidden p-6">
        <WorkspaceView />
      </GlassSurface>
    </SideMenuLayout>
  );
}
