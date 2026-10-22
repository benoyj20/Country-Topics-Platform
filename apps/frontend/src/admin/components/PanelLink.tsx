import { frontendSettings } from "@/settings";

/**
 * Where the work on a screen not built yet is done for now: locally, the
 * same address in Payload's panel on the backend (ADR 0014, phases 7 to
 * 11). No hosted environment has the panel.
 */
export function PanelLink({ path }: { path: string }) {
  const settings = frontendSettings();
  if (settings.environment !== "local") {
    return (
      <p className="admin-muted">
        Until then, Payload&apos;s panel runs on the developer&apos;s machine
        only.
      </p>
    );
  }
  return (
    <p>
      Until then, staff use Payload&apos;s panel on this machine:{" "}
      <a href={`${settings.backendUrl}${path}`}>open this page there</a>.
    </p>
  );
}
