import { Suspense } from "react";
import { AuthForm } from "@/components/shared/AuthForm";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <Suspense>
      <AuthForm mode="register" />
    </Suspense>
  );
}
