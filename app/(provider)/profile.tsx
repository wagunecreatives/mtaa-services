import { RouteMessage, RouteScaffold } from "../../components/RouteScaffold";
import { useAuth } from "../../contexts/AuthContext";

export default function ProviderProfileScreen() {
  const { profile, user } = useAuth();
  return (
    <RouteScaffold eyebrow="Provider" title="Provider profile" description="Your account details and provider status.">
      <RouteMessage>Name: {profile?.full_name || "Not set"}{"\n"}Email: {user?.email || "Not available"}{"\n"}Phone: {profile?.phone || "Not set"}{"\n"}Onboarding: {profile?.onboarding_completed ? "Complete" : "Not complete"}</RouteMessage>
    </RouteScaffold>
  );
}
