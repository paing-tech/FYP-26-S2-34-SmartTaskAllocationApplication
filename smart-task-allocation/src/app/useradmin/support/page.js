import SideMenuLayout from "@/components/SideMenuLayout";
import GlassSurface from "@/components/ui/glass-surface";
import SupportCenter from "@/components/SupportCenter";

export default function UserAdminSupportPage() {
  return <SideMenuLayout actor="useradmin"><GlassSurface className="h-full overflow-y-auto p-6"><SupportCenter allowFeedback={false} /></GlassSurface></SideMenuLayout>;
}
