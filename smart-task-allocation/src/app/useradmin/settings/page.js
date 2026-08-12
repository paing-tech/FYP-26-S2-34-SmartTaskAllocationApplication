import SideMenuLayout from "@/components/SideMenuLayout";
import LeavePolicySettings from "@/components/LeavePolicySettings";
import WorkHourPolicySettings from "@/components/WorkHourPolicySettings";
import WorkloadPolicySettings from "@/components/WorkloadPolicySettings";
import GlassSurface from "@/components/ui/glass-surface";

export default function UserAdminSettingsPage() {
  return (
    <SideMenuLayout actor="useradmin">
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
        <GlassSurface className="shrink-0 p-5">
          <LeavePolicySettings />
        </GlassSurface>

        <GlassSurface className="shrink-0 p-5">
          <WorkHourPolicySettings />
        </GlassSurface>

        <GlassSurface className="shrink-0 p-5">
          <WorkloadPolicySettings />
        </GlassSurface>
      </div>
    </SideMenuLayout>
  );
}
