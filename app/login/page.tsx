"use client";

import { useRouter } from "next/navigation";
import { AuthModal } from "@/features/auth/AuthModal";

/**
 * Fallback sign-in page. The unified nav opens the AuthModal directly; this
 * route stays as a deep-link/redirect target (protected routes bounce here and
 * the proxy sends authenticated users home). Mounts the same reusable modal.
 */
export default function SignInPage() {
  const router = useRouter();
  return <AuthModal open initialMode="login" onClose={() => router.push("/")} />;
}
