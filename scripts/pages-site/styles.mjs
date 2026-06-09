export function buildStyles() {
  return `:root {
  color-scheme: light dark;
  --k-font-display: ui-serif, Georgia, Cambria, "Times New Roman", serif;
  --k-font-ui: ui-serif, Georgia, Cambria, "Times New Roman", serif;
  --k-bg: #f3efe3;
  --k-text: #17201b;
  --k-text-muted: #657267;
  --k-panel: #fffcf1;
  --k-panel-raised: #fbf6e7;
  --k-line: rgba(36, 68, 52, 0.16);
  --k-brand: #0f6b52;
  --surface-panel: color-mix(in srgb, var(--k-panel) 78%, transparent);
  --surface-panel-raised: color-mix(in srgb, var(--k-panel-raised) 82%, transparent);
  --surface-accent-secondary: color-mix(in srgb, var(--k-caution) 72%, var(--k-negative));
  --surface-brand-glow: color-mix(in srgb, var(--k-brand) 18%, transparent);
  --surface-code-bg: color-mix(in srgb, var(--k-text) 8%, transparent);
}

@media (prefers-color-scheme: dark) {
  :root {
    --k-bg: #101511;
    --k-text: #edf0e8;
    --k-text-muted: #a3ad9d;
    --k-panel: #151e17;
    --k-panel-raised: #1c281f;
    --k-line: rgba(212, 224, 204, 0.16);
    --k-brand: #7ee0bd;
    --surface-panel: color-mix(in srgb, var(--k-panel) 82%, transparent);
    --surface-panel-raised: color-mix(in srgb, var(--k-panel-raised) 82%, transparent);
    --surface-accent-secondary: color-mix(in srgb, var(--k-caution) 52%, var(--k-negative));
    --surface-brand-glow: color-mix(in srgb, var(--k-brand) 18%, transparent);
    --surface-code-bg: color-mix(in srgb, var(--k-text) 8%, transparent);
  }
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--k-font-display);
  color: var(--k-text);
  background: radial-gradient(circle at top left, var(--surface-brand-glow), transparent 28rem), var(--k-bg);
  line-height: 1.6;
}
.terrain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.22;
  background-image:
    repeating-radial-gradient(ellipse at 20% 20%, transparent 0 18px, var(--k-line) 19px 20px),
    repeating-radial-gradient(ellipse at 80% 10%, transparent 0 28px, var(--k-line) 29px 30px);
  mask-image: linear-gradient(to bottom, black, transparent 75%);
}
header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 1rem clamp(1rem, 4vw, 4rem);
  background: color-mix(in srgb, var(--k-bg) 84%, transparent);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--k-line);
}
.brand {
  color: var(--k-text);
  font-weight: 800;
  letter-spacing: -0.03em;
  text-decoration: none;
  font-size: 1.2rem;
}
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  justify-content: flex-end;
}
nav a {
  color: var(--k-text-muted);
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  font-size: 0.9rem;
}
nav a[aria-current="page"], nav a:hover {
  color: var(--k-text);
  border-color: var(--k-line);
  background: var(--surface-panel);
}
main {
  position: relative;
  width: min(1040px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 4rem 0;
}
.hero {
  padding: clamp(2rem, 6vw, 6rem);
  border: 1px solid var(--k-line);
  border-radius: 2rem;
  background: linear-gradient(135deg, var(--surface-panel), color-mix(in srgb, var(--surface-panel) 70%, transparent));
  box-shadow: var(--k-shadow);
}
.eyebrow {
  color: var(--surface-accent-secondary);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
}
.hero h1 {
  max-width: 780px;
  font-size: clamp(2.5rem, 8vw, 5.8rem);
  line-height: 0.92;
  letter-spacing: -0.08em;
  margin: 0;
}
.hero p {
  max-width: 720px;
  font-size: 1.2rem;
}
.hero-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.75rem;
  margin-top: 2rem;
}
.hero-grid span {
  border: 1px solid var(--k-line);
  border-radius: 1rem;
  padding: 0.9rem;
  background: var(--surface-panel-raised);
  font-weight: 700;
}
article {
  margin-top: 2rem;
  padding: clamp(1.25rem, 4vw, 3rem);
  border: 1px solid var(--k-line);
  border-radius: 1.5rem;
  background: var(--surface-panel);
}
h1, h2, h3 {
  line-height: 1.05;
  letter-spacing: -0.04em;
}
h1 { font-size: clamp(2rem, 5vw, 3.8rem); }
h2 { margin-top: 2.2rem; font-size: 2rem; }
a { color: var(--k-brand); }
ol, ul {
  padding-left: 1.4rem;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
  overflow-wrap: anywhere;
}
th, td {
  vertical-align: top;
  padding: 0.75rem;
  border: 1px solid var(--k-line);
}
th {
  text-align: left;
  background: var(--surface-panel-raised);
}
code {
  font-family: var(--k-font-mono);
  font-size: 0.92em;
}
pre {
  overflow: auto;
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid var(--k-line);
  background: var(--surface-code-bg);
}
pre.mermaid {
  background: var(--surface-panel-raised);
  white-space: pre;
}
footer {
  position: relative;
  padding: 2rem;
  text-align: center;
  color: var(--k-text-muted);
}
`;
}
