export default function AgentUnavailable() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center rounded-[28px] border border-white/60 bg-white/25 p-8 text-center backdrop-blur-sm">
      <div className="max-w-sm">
        <h2 className="text-lg font-bold text-[#0D1E4C]">Agent management is handled by Managers</h2>
        <p className="mt-2 text-sm text-[#0D1E4C]/70">
          Managers configure and train the AI agent for your organization. Reach out to your manager if you&apos;d
          like something added to it.
        </p>
      </div>
    </div>
  );
}
