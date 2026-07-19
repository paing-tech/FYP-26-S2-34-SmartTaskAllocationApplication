import ManagerPlaceholderPage from "@/components/ManagerPlaceholderPage";
import SideMenuLayout from "@/components/SideMenuLayout";
import GlassSurface from "@/components/ui/glass-surface";

export default function EmployeeInboxPage() {
  return (
    <SideMenuLayout actor="employee">
      <GlassSurface className="h-full overflow-y-auto p-8">
        <ManagerPlaceholderPage
          eyebrow="Employee"
          title="Inbox"
          description="Review workspace updates and direct messages."
        />
      </GlassSurface>
    </SideMenuLayout>
  );
}
