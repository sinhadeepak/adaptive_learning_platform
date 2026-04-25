import { tokens } from "@alp/design-system";

interface PlaceholderProps {
  title: string;
  wireframeRef?: string;
  storyRef?: string;
}

export function Placeholder({ title, wireframeRef, storyRef }: PlaceholderProps) {
  return (
    <main
      style={{
        fontFamily: tokens.typography.family.ui,
        color: tokens.colors.text.primary,
        padding: tokens.spacing[6],
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: tokens.typography.scale.pageTitle.size, fontWeight: tokens.typography.scale.pageTitle.weight }}>
        {title}
      </h1>
      <p style={{ color: tokens.colors.text.secondary }}>Not yet implemented.</p>
      {wireframeRef ? (
        <p style={{ color: tokens.colors.text.muted, fontSize: tokens.typography.scale.hint.size }}>
          Wireframe: <code>{wireframeRef}</code>
        </p>
      ) : null}
      {storyRef ? (
        <p style={{ color: tokens.colors.text.muted, fontSize: tokens.typography.scale.hint.size }}>
          User story: <code>{storyRef}</code>
        </p>
      ) : null}
    </main>
  );
}
