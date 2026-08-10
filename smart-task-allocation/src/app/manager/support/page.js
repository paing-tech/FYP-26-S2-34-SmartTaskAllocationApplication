import SideMenuLayout from "@/components/SideMenuLayout";
import GlassSurface from "@/components/ui/glass-surface";
import SupportCenter from "@/components/SupportCenter";

export default function ManagerSupportPage() {
  return <SideMenuLayout actor="manager"><GlassSurface className="h-full overflow-y-auto p-6"><SupportCenter /></GlassSurface></SideMenuLayout>;
}
