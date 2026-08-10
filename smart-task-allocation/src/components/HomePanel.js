export default function HomePanel({ title, description }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold text-[#07183b]">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52627a]">{description}</p>
    </section>
  );
}
