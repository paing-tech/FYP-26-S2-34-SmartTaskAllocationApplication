import SideMenuLayout from "@/components/SideMenuLayout";
import UserAdminOrganizationBuilder from "@/components/UserAdminOrganizationBuilder";
import LeavePolicySettings from "@/components/LeavePolicySettings";
import WorkHourPolicySettings from "@/components/WorkHourPolicySettings";
import GlassSurface from "@/components/ui/glass-surface";

export default function UserAdminOrganizationPage() {
  return (
    <SideMenuLayout actor="useradmin">
      <div className="flex h-full min-h-0 flex-col gap-4">
        <GlassSurface className="min-h-0 flex-1 overflow-y-auto p-2">
          <UserAdminOrganizationBuilder />
        </GlassSurface>

        <GlassSurface className="shrink-0 p-5">
          <LeavePolicySettings />
        </GlassSurface>

        <GlassSurface className="shrink-0 p-5">
          <WorkHourPolicySettings />
        </GlassSurface>
      </div>
    </SideMenuLayout>
  );
}
