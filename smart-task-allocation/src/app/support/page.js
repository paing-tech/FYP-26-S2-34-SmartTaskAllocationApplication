import Link from "next/link";
import SupportCenter from "@/components/SupportCenter";

export default function PublicSupportPage() {
  return <main className="min-h-screen bg-[#C7DDEB] px-6 py-10 text-[#07183b]"><div className="mx-auto max-w-5xl"><Link href="/" className="inline-flex rounded-full bg-white/70 px-5 py-2 text-sm font-bold">Back to Optima</Link><div className="mt-8"><SupportCenter allowFeedback={false} publicMode /></div></div></main>;
}
