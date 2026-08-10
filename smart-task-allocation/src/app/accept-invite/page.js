import AcceptInviteJoin from "@/components/AcceptInviteJoin";
import Strands from "@/components/Strands";

export default function AcceptInvitePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-10">
      <div className="pointer-events-none absolute left-1/2 top-110 z-0 h-[1200px] w-[1400px] max-w-[120vw] -translate-x-1/2 -translate-y-1/2 -rotate-40">
        <Strands
          colors={["#F97316", "#7C3AED", "#2563EB"]}
          count={3}
          speed={0.5}
          amplitude={1}
          waviness={1}
          thickness={0.7}
          glow={2.6}
          taper={3}
          spread={1}
          intensity={0.6}
          saturation={2}
          opacity={1}
          scale={1.5}
        />
      </div>

      <div className="relative z-10 w-full max-w-xl">
        <AcceptInviteJoin />
      </div>
    </main>
  );
}
