"use client";

import { useRouter } from "next/navigation";
import { AuthModal } from "@/features/auth/AuthModal";

/**
 * Fallback sign-up page. Deep links (e.g. the landing "Sign up free" CTA) land
 * here; the modal is the same reusable one the nav opens. Closing returns home.
 */
export default function SignupPage() {
  const router = useRouter();
  return <AuthModal open initialMode="signup" onClose={() => router.push("/")} />;
}
