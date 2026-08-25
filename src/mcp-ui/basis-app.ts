import { App } from "@modelcontextprotocol/ext-apps";

interface BasisPanelElement extends HTMLElement { basisProjection: unknown; }

const panel = document.querySelector<BasisPanelElement>("surface-trust-panel");
const data = document.getElementById("surface-basis-data");
const setBasis = (value: unknown): void => { if (panel) panel.basisProjection = value; };

try { setBasis(JSON.parse(data?.textContent || "null")); } catch { setBasis(null); }

void (async () => {
  let connected = false;
  const app = new App({ name: "Surface Basis", version: "1.0.0" }, {}, { autoResize: true, strict: true });
  app.ontoolresult = (result) => {
    if (!connected) return;
    const projection = result.structuredContent;
    if (projection && typeof projection === "object" && !Array.isArray(projection)) setBasis(projection);
  };
  try {
    await app.connect();
    connected = true;
  } catch {
    // The inlined snapshot remains available when a host cannot negotiate Apps.
  }
})();
