import SideMenuLayout from "@/components/SideMenuLayout";
import GlassSurface from "@/components/ui/glass-surface";
import ManagerTaskRequests from "@/components/ManagerTaskRequests";

export default function ManagerRequestsPage(){return <SideMenuLayout actor="manager"><GlassSurface className="h-full overflow-y-auto p-6"><ManagerTaskRequests /></GlassSurface></SideMenuLayout>;}
