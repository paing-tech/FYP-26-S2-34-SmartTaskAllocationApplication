import RegisterForm from "@/components/RegisterForm";

export default function SignupPage() {
  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-800 bg-cover bg-center px-4 py-10"
      style={{ backgroundImage: "url('/bg.jpg')" }}
    >
      <div className="relative z-10 w-full max-w-2xl">
        <RegisterForm />
      </div>
    </main>
  );
}
