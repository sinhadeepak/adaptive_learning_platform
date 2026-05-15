// LowBandwidthToggle — UX-32 prefs widget (Phase 6 S57).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S57
//
// 3-knob settings panel:
//   - reduce animations
//   - turn off background prefetching
//   - load lite images
//
// Stored in localStorage via lib/low-bandwidth.ts. Wireable into any
// settings page; for v0 the Home page surfaces a compact version
// only when the user has any pref enabled.

import { useEffect, useState } from "react";

import {
  loadLowBandwidthPrefs,
  prefersReducedMotion,
  saveLowBandwidthPrefs,
  type LowBandwidthPrefs,
} from "../lib/low-bandwidth";

export interface LowBandwidthToggleProps {
  /** Heading-only / compact variant for cramped surfaces. */
  compact?: boolean;
}

export function LowBandwidthToggle({ compact = false }: LowBandwidthToggleProps) {
  const [prefs, setPrefs] = useState<LowBandwidthPrefs>(() =>
    loadLowBandwidthPrefs(),
  );
  const systemReducedMotion = prefersReducedMotion();

  // Persist every change.
  useEffect(() => {
    saveLowBandwidthPrefs(prefs);
  }, [prefs]);

  function toggle(key: keyof LowBandwidthPrefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  return (
    <section className={`low-bw${compact ? " is-compact" : ""}`}>
      <header className="low-bw-head">
        <span className="low-bw-glyph" aria-hidden>
          📶
        </span>
        <div>
          <h3 className="low-bw-title">Low-bandwidth mode</h3>
          <p className="low-bw-sub">
            On flaky or expensive cellular? Trim the visual weight + cut
            background prefetching.
          </p>
        </div>
      </header>
      <div className="low-bw-rows">
        <ToggleRow
          label="Reduce animations"
          help={
            systemReducedMotion
              ? "Your system already requests reduced motion — we always honor that."
              : "Drop transitions + scrim fade-ins."
          }
          checked={prefs.reducedAnimations || systemReducedMotion}
          disabled={systemReducedMotion}
          onChange={() => toggle("reducedAnimations")}
        />
        <ToggleRow
          label="Disable background prefetch"
          help="Pages won't warm extra data behind the scenes."
          checked={prefs.prefetchOff}
          onChange={() => toggle("prefetchOff")}
        />
        <ToggleRow
          label="Use lite images"
          help="Hero illustrations swap for lower-DPR variants when available."
          checked={prefs.imagesLite}
          onChange={() => toggle("imagesLite")}
        />
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`low-bw-row${disabled ? " is-disabled" : ""}`}>
      <div className="low-bw-row-text">
        <div className="low-bw-row-label">{label}</div>
        <div className="low-bw-row-help">{help}</div>
      </div>
      <span className={`low-bw-switch${checked ? " is-on" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
        <span className="low-bw-thumb" aria-hidden />
      </span>
    </label>
  );
}
