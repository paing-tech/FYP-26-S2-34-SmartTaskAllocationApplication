import SideMenuLayout from "@/components/SideMenuLayout";
import GlassSurface from "@/components/ui/glass-surface";
import AllocationEfficiency from "@/components/AllocationEfficiency";
import AllocationVolume from "@/components/AllocationVolume";
import ProductivityTrends from "@/components/ProductivityTrends";
import WorkloadDistribution from "@/components/WorkloadDistribution";
import AiApprovalBreakdown from "@/components/AiApprovalBreakdown";

export default function UserAdminInsightsPage() {
  return (
    <SideMenuLayout actor="useradmin">
      <GlassSurface className="h-full overflow-hidden p-6">
        <div className="grid h-full grid-cols-2 gap-4">
          <div className="flex h-full flex-col gap-4">
            <div className="h-[60%]">
              <AllocationEfficiency />
            </div>
            <div className="h-[40%]">
              <AllocationVolume />
            </div>
          </div>
          <div className="flex h-full flex-col gap-4">
            <div className="h-[30%] min-h-75">
              <ProductivityTrends />
            </div>
            <div className="h-[40%]">
              <WorkloadDistribution />
            </div>
            <div className="h-[20%]">
              <AiApprovalBreakdown />
            </div>
          </div>
        </div>
      </GlassSurface>
    </SideMenuLayout>
  );
}
