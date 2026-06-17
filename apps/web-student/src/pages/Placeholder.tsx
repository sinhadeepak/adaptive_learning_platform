import "@alp/design-system/shell.css";

interface PlaceholderProps {
  title: string;
  wireframeRef?: string;
  storyRef?: string;
}

export function Placeholder({ title, wireframeRef, storyRef }: PlaceholderProps) {
  return (
    <main
      style={{
        padding: "var(--sp-6)",
        maxWidth: 720,
        margin: "0 auto",
        color: "var(--ink)",
      }}
    >
      <h1 className="page-greeting">{title}</h1>
      <p className="page-subhead">Not yet implemented.</p>
      {wireframeRef ? (
        <p style={{ color: "var(--ink-3)", fontSize: 12 }}>
          Wireframe: <code>{wireframeRef}</code>
        </p>
      ) : null}
      {storyRef ? (
        <p style={{ color: "var(--ink-3)", fontSize: 12 }}>
          User story: <code>{storyRef}</code>
        </p>
      ) : null}
    </main>
  );
}