// Unit tests for ContentCard's resource_type dispatch — one assertion per
// type: video opens the player, document opens the viewer, note expands
// inline markdown, url renders an external anchor.

import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ContentCard } from "./ContentCard";
import type { StudentResource } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  contentResources: { recordView: vi.fn() },
}));

function res(over: Partial<StudentResource>): StudentResource {
  return {
    id: "r1",
    topic_id: "t1",
    concept_id: null,
    question_id: null,
    resource_type: "youtube_video",
    external_id: "abc",
    url: "https://youtu.be/abc",
    title: "Sample",
    description: null,
    channel_name: null,
    duration_seconds: 120,
    thumbnail_url: null,
    language: "en",
    difficulty: null,
    ...over,
  };
}

afterEach(() => vi.clearAllMocks());

describe("ContentCard dispatch", () => {
  test("video → onOpenVideo", () => {
    const onVideo = vi.fn();
    render(
      <ContentCard
        resource={res({ resource_type: "youtube_video", title: "Torque" })}
        onOpenVideo={onVideo}
        onOpenDoc={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Torque"));
    expect(onVideo).toHaveBeenCalledOnce();
  });

  test("document → onOpenDoc", () => {
    const onDoc = vi.fn();
    render(
      <ContentCard
        resource={res({ resource_type: "document", title: "Sheet", external_id: null })}
        onOpenVideo={vi.fn()}
        onOpenDoc={onDoc}
      />,
    );
    fireEvent.click(screen.getByText("Sheet"));
    expect(onDoc).toHaveBeenCalledOnce();
  });

  test("note → expands inline markdown", () => {
    render(
      <ContentCard
        resource={res({
          resource_type: "note",
          title: "Key formulas",
          external_id: null,
          description: "Newton's **second law**",
        })}
        onOpenVideo={vi.fn()}
        onOpenDoc={vi.fn()}
      />,
    );
    // Body hidden until toggled.
    expect(screen.queryByText("second law")).toBeNull();
    fireEvent.click(screen.getByText("Key formulas"));
    expect(screen.getByText("second law")).toBeInTheDocument();
  });

  test("url → external anchor", () => {
    render(
      <ContentCard
        resource={res({
          resource_type: "url",
          title: "Khan link",
          external_id: null,
          url: "https://khanacademy.org/x",
        })}
        onOpenVideo={vi.fn()}
        onOpenDoc={vi.fn()}
      />,
    );
    const link = screen.getByText("Khan link").closest("a");
    expect(link).toHaveAttribute("href", "https://khanacademy.org/x");
    expect(link).toHaveAttribute("target", "_blank");
  });

  test("video shows watched badge when completed", () => {
    render(
      <ContentCard
        resource={res({ title: "Done clip" })}
        progress={{
          furthestPositionSeconds: 120,
          resumePositionSeconds: 120,
          furthestPercent: 100,
          watched: true,
        }}
        onOpenVideo={vi.fn()}
        onOpenDoc={vi.fn()}
      />,
    );
    expect(screen.getByText("✓ Watched")).toBeInTheDocument();
  });
});
