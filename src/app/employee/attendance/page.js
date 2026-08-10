import SideMenuLayout from "@/components/SideMenuLayout";
import AttendanceClock from "@/components/AttendanceClock";
import GlassSurface from "@/components/ui/glass-surface";

export default function EmployeeAttendancePage() {
  return (
    <SideMenuLayout actor="employee">
      <GlassSurface className="h-full overflow-hidden p-6">
        <AttendanceClock />
      </GlassSurface>
    </SideMenuLayout>
  );
}
