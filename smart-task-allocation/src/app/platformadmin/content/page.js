import SideMenuLayout from "@/components/SideMenuLayout";
import MarketingContentManager from "@/components/MarketingContentManager";

export default function PlatformAdminContentPage() {
  return (
    <SideMenuLayout actor="platformadmin">
      <MarketingContentManager />
    </SideMenuLayout>
  );
}
