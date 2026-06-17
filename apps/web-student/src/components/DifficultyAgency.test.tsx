// Component smoke tests for the S54 difficulty-agency widgets:
// IntentSelector · FrictionPrompt · PostQuizCalibration · AdaptsExplainerCard.

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { IntentSelector } from "./IntentSelector";
import { FrictionPrompt } from "./FrictionPrompt";
import { PostQuizCalibration } from "./PostQuizCalibration";
import { AdaptsExplainerCard } from "./AdaptsExplainerCard";

beforeEach(() => {
  window.localStorage.clear();
  // Most tests don't need the network; default to a "match" offset preview.
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(
      JSON.stringify({
        intent_anchor: "match",
        offset: 0,
        effective_theta: 0,
      }),
      { status: 200 },
    ),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("IntentSelector", () => {
  test("renders 3 buttons + help copy for the active intent", async () => {
    render(
      <IntentSelector value="match" onChange={() => {}} thetaHat={0} />,
    );
    expect(screen.getByText("Build confidence")).toBeInTheDocument();
    expect(screen.getByText("Match my level")).toBeInTheDocument();
    expect(screen.getByText("Push me")).toBeInTheDocument();
    expect(screen.getByText(/accuracy lands around/)).toBeInTheDocument();
    // Preview shows once /adaptive/intent/theta-offset returns.
    await waitFor(() =>
      expect(screen.getByText(/Effective θ̂/)).toBeInTheDocument(),
    );
  });

  test("clicking an option fires onChange with the matching anchor", () => {
    const onChange = vi.fn();
    render(<IntentSelector value="match" onChange={onChange} />);
    fireEvent.click(screen.getByText("Push me"));
    expect(onChange).toHaveBeenCalledWith("push");
  });

  test("compact=true hides the help paragraph", () => {
    render(
      <IntentSelector value="match" onChange={() => {}} compact />,
    );
    expect(screen.queryByText(/accuracy lands around/)).toBeNull();
  });
});

describe("FrictionPrompt", () => {
  const trigger = {
    reason: "repeated_wrong" as const,
    suggestedOffset: -0.2,
    suggestedAction: "easier" as const,
    message: "The last 3 felt rough.",
  };

  test("renders nothing when trigger is null", () => {
    const { container } = render(
      <FrictionPrompt trigger={null} onAccept={() => {}} onDismiss={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("shows the trigger message + reason label", () => {
    render(
      <FrictionPrompt
        trigger={trigger}
        onAccept={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/Three wrong in a row/)).toBeInTheDocument();
    expect(screen.getByText("The last 3 felt rough.")).toBeInTheDocument();
  });

  test("accept fires onAccept with the offset + action", () => {
    const onAccept = vi.fn();
    render(
      <FrictionPrompt
        trigger={trigger}
        onAccept={onAccept}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByText(/Yes, ease up/));
    expect(onAccept).toHaveBeenCalledWith(-0.2, "easier");
  });

  test("dismiss fires onDismiss", () => {
    const onDismiss = vi.fn();
    render(
      <FrictionPrompt
        trigger={trigger}
        onAccept={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText("Stay the course"));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe("PostQuizCalibration", () => {
  test("renders all 3 calibration buttons", () => {
    render(
      <PostQuizCalibration
        sessionId="sid-1"
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByText("Too easy")).toBeInTheDocument();
    expect(screen.getByText("Just right")).toBeInTheDocument();
    expect(screen.getByText("Too hard")).toBeInTheDocument();
  });

  test("clicking a bucket calls onSubmit and shows the saved state", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PostQuizCalibration sessionId="sid-1" onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByText("Just right"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("right"));
    await waitFor(() =>
      expect(screen.getByText(/Saved/)).toBeInTheDocument(),
    );
  });

  test("onSubmit error surfaces in the err slot", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("boom"));
    render(
      <PostQuizCalibration sessionId="sid-1" onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByText("Too hard"));
    await waitFor(() =>
      expect(screen.getByText("boom")).toBeInTheDocument(),
    );
  });

  test("initialValue pre-selects the bucket", () => {
    render(
      <PostQuizCalibration
        sessionId="sid-1"
        onSubmit={async () => {}}
        initialValue="too_easy"
      />,
    );
    expect(screen.getByText(/Saved/)).toBeInTheDocument();
  });
});

describe("AdaptsExplainerCard", () => {
  test("renders on first visit", () => {
    render(<AdaptsExplainerCard />);
    expect(
      screen.getByText("How adaptive practice works"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Pick your intent before each round/),
    ).toBeInTheDocument();
  });

  test("dismiss flips the seen flag and onDismiss callback fires", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<AdaptsExplainerCard onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText("Dismiss explainer"));
    expect(onDismiss).toHaveBeenCalled();
    // Subsequent renders return null.
    rerender(<AdaptsExplainerCard onDismiss={onDismiss} />);
    expect(
      screen.queryByText("How adaptive practice works"),
    ).toBeNull();
  });

  test("returns null when the seen flag is already set", () => {
    window.localStorage.setItem("quiz.adapt_explainer.seen.v1", "1");
    const { container } = render(<AdaptsExplainerCard />);
    expect(container.firstChild).toBeNull();
  });
});
