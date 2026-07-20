import SideMenuLayout from "@/components/SideMenuLayout";
import UserAdminOrganizationBuilder from "@/components/UserAdminOrganizationBuilder";
import GlassSurface from "@/components/ui/glass-surface";

export default function UserAdminOrganizationPage() {
  return (
    <SideMenuLayout actor="useradmin">
      <GlassSurface className="h-full overflow-y-auto p-2">
        <UserAdminOrganizationBuilder />
      </GlassSurface>
    </SideMenuLayout>
  );
}
