import SideMenuLayout from "@/components/SideMenuLayout";
import GlassSurface from "@/components/ui/glass-surface";
import AllocationEfficiency from "@/components/AllocationEfficiency";
import ProductivityTrends from "@/components/ProductivityTrends";

export default function UserAdminInsightsPage() {
  return (
    <SideMenuLayout actor="useradmin">
      <GlassSurface className="h-full overflow-hidden p-6">
        <div className="grid h-full grid-cols-2 gap-4">
          <div className="h-1/2">
            <AllocationEfficiency />
          </div>
          <div className="h-[30%] min-h-[300px]">
            <ProductivityTrends />
          </div>
        </div>
      </GlassSurface>
    </SideMenuLayout>
  );
}
