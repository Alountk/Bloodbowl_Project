import { ProfilePanel } from "@/features/profile/ProfilePanel";

/**
 * Server-rendered profile page. Auto-protected by proxy.ts (a real session is
 * required in auth mode); delegates the client UI to ProfilePanel.
 */
export default function ProfilePage() {
  return <ProfilePanel />;
}
