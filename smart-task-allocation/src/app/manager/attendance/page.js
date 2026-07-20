import SideMenuLayout from "@/components/SideMenuLayout";
import AttendanceClock from "@/components/AttendanceClock";
import GlassSurface from "@/components/ui/glass-surface";

export default function ManagerAttendancePage() {
  return (
    <SideMenuLayout actor="manager">
      <GlassSurface className="h-full overflow-hidden p-8">
        <AttendanceClock />
      </GlassSurface>
    </SideMenuLayout>
  );
}
