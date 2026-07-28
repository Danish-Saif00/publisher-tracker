import { useAuth } from "../../features/auth/use-auth";
import { TrackingLinksPage as AdministrativeTrackingLinksPage } from "./tracking-links-page";
import { PublisherTrackingLinksPage } from "./publisher-tracking-links-page";

export function TrackingLinksPage() {
  const auth = useAuth();
  const membership = auth.identity?.authorization.companyMembership ?? null;
  const isPublisher =
    membership?.status === "active" && membership.role === "publisher";

  return isPublisher ? (
    <PublisherTrackingLinksPage />
  ) : (
    <AdministrativeTrackingLinksPage />
  );
}
