import React, { useState } from "react";

function JsonViewer({ title, data, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="json-viewer">
      <button
        type="button"
        className="json-viewer-toggle"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{title}</span>
        <span>{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <pre className="json-output">{JSON.stringify(data, null, 2)}</pre>
      )}
    </section>
  );
}

export default JsonViewer;
