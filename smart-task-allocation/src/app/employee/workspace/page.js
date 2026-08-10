import EmployeeWorkspaceView from "@/components/EmployeeWorkspaceView";
import SideMenuLayout from "@/components/SideMenuLayout";
import GlassSurface from "@/components/ui/glass-surface";

export default function EmployeeWorkspacePage() {
  return (
    <SideMenuLayout actor="employee">
      <GlassSurface className="h-full overflow-hidden p-6">
        <EmployeeWorkspaceView />
      </GlassSurface>
    </SideMenuLayout>
  );
}
