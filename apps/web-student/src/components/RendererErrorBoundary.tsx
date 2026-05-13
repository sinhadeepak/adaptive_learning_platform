// Defensive error boundary around polymorphic question renderers.
//
// Why: a single malformed payload (legacy seed missing a field, a
// schema field rename the renderer hasn't picked up, …) used to take
// down the entire /quiz/<id> route with a blank Unexpected Application
// Error screen — the user can't even click Back, the whole React tree
// has unmounted. This boundary scopes the failure to the question
// content area: stem + session bar + progress strip stay rendered;
// the answer surface is replaced with a skippable error card so the
// student can move on instead of being stranded.
//
// On crash we log to console with the full error + payload (helpful
// in dev / when a tester reports an issue) and expose two CTAs that
// the parent wires up: `onSkip` (advance to next item) and `onReport`
// (open a doubt with this question prefilled, future). Keep this
// component intentionally tiny and dependency-free — it must work
// even when the design-system bundle is broken.

import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";

interface Props {
  /** Stable identifier for the wrapped question. Resetting the
   *  boundary when this changes is how we recover after the user
   *  navigates to a different item. */
  resetKey: string;
  /** Called when the user clicks "Skip this question". Wire to the
   *  parent's next-question action. Optional — when omitted the
   *  Skip button is hidden. */
  onSkip?: () => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class RendererErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(
      "[renderer-boundary] question render crashed",
      { error, info, resetKey: this.props.resetKey },
    );
  }

  componentDidUpdate(prev: Props): void {
    // Reset on question change so the next item gets a fresh attempt.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          padding: 16,
          background: "var(--bg-surface3, #fff8f8)",
          border: "1px solid var(--color-red, #f43f5e)",
          borderRadius: 8,
          color: "var(--text-primary, #1f2937)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
          ⚠ This question can't be displayed
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.5, margin: "0 0 12px", color: "var(--text-muted, #6b7280)" }}>
          The renderer hit an unexpected payload shape. We've logged the
          issue. Skip to the next item to keep practising — your earlier
          answers are saved.
        </p>
        {this.props.onSkip && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: "6px 14px", fontSize: 12 }}
            onClick={this.props.onSkip}
          >
            Skip this question →
          </button>
        )}
      </div>
    );
  }
}
