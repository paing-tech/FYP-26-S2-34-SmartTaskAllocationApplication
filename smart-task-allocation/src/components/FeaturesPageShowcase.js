"use client";

// The /features page's showcase section — a large "Features" title on
// black, followed by an alternating left/right zigzag of screenshots from
// public/preview/, one row per major feature area.
const SECTIONS = [
  {
    title: "User Account Management",
    description: "Invite teammates, manage roles, and keep every account under control from one place.",
    image: "/preview/accountmanagement.png",
  },
  {
    title: "Organization Hierarchy Management",
    description: "Build and visualize your org chart, from departments down to individual reports.",
    image: "/preview/organizationmanagement.png",
  },
  {
    title: "Workforce Performance Analytics",
    description: "Track completion rates, workload, and performance trends across your whole team.",
    image: "/preview/workforoceperformance.png",
  },
  {
    title: "Workforce Scheduling",
    description: "Plan shifts and attendance so every task lines up with who's actually working.",
    image: "/preview/worforceschedule.png",
  },
  {
    title: "Skills Management",
    description: "Maintain the organization-wide skill catalog that managers and the AI draw from when matching people to tasks.",
    image: "/preview/skillsmanagement.png",
  },
  {
    title: "Allocation and Productivity Insights",
    description: "See how work is distributed and where the AI's assignments are paying off.",
    image: "/preview/insights.png",
  },
  {
    title: "Workspace Management",
    description: "Organize work into workspaces and task groups that mirror how your teams actually operate.",
    image: "/preview/workspace.png",
  },
  {
    title: "My Tasks",
    description: "A focused view of what's due today, what's overdue, and what's next.",
    image: "/preview/mytasks.png",
  },
];

export default function FeaturesPageShowcase() {
  return (
    <>
      <div className="w-full bg-black py-16 text-center text-white">
        <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Features</h2>
      </div>

      <section className="w-full bg-white text-[#0D1E4C]">
        {SECTIONS.map((section, index) => {
          const imageOnRight = index % 2 === 0;
          return (
            <div key={section.title} className={`w-full ${index % 2 === 1 ? "bg-[#F8FAFC]" : "bg-white"}`}>
              <div
                className={`mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 py-16 md:flex-row ${
                  imageOnRight ? "" : "md:flex-row-reverse"
                }`}
              >
                <div className="md:w-1/2">
                  <h3 className="text-2xl font-bold sm:text-3xl">{section.title}</h3>
                  <p className="mt-4 text-base leading-relaxed text-[#0D1E4C]/70">{section.description}</p>
                </div>

                <div className="md:w-1/2">
                  <div
                    className="animate-float-rectangle relative aspect-8/5 w-full overflow-hidden rounded-3xl border border-[#2563EB]/40 shadow-[0_30px_80px_rgba(13,30,76,0.15),0_0_50px_rgba(37,99,235,0.45)]"
                    style={{ animationDelay: `${(index % 4) * 0.6}s` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={section.image} alt={section.title} className="h-full w-full object-cover" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
