import SideMenuLayout from "@/components/SideMenuLayout";
import GlassSurface from "@/components/ui/glass-surface";
import EmployeeTaskRequests from "@/components/EmployeeTaskRequests";

export default function EmployeeTasksPage(){return <SideMenuLayout actor="employee"><GlassSurface className="h-full overflow-y-auto p-6"><EmployeeTaskRequests /></GlassSurface></SideMenuLayout>;}
