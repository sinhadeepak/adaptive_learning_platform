// /settings/bandwidth — UX-32 low-bandwidth preferences page (P6 S57).

import { AppShell } from "../components/AppShell";
import { LowBandwidthToggle } from "../components/LowBandwidthToggle";

export function BandwidthSettings() {
  return (
    <AppShell title="Bandwidth">
      <LowBandwidthToggle />
      <p
        style={{
          marginTop: 20,
          fontSize: 12,
          color: "var(--ink-4, #7A8BAD)",
          maxWidth: 540,
          lineHeight: 1.5,
        }}
      >
        Preferences are saved on this device only. Animation reductions
        respect your system-level "reduce motion" setting automatically —
        the toggle is hidden when the OS is already requesting it.
      </p>
    </AppShell>
  );
}