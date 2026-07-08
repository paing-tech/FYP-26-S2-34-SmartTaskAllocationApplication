import AuthForm from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-800 px-4 py-10">
      <div className="relative z-10 w-full max-w-xl">
        <AuthForm />
      </div>
    </main>
  );
}
