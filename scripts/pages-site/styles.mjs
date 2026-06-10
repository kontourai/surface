export function buildStyles() {
  return `:root {
  color-scheme: light dark;
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
  --surface-tap-target: 44px;
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
  font-family: var(--k-font-ui);
  color: var(--k-text);
  background: radial-gradient(circle at top left, var(--surface-brand-glow), transparent 28rem), var(--k-bg);
  line-height: 1.65;
  -webkit-text-size-adjust: 100%;
}
.skip-link {
  position: absolute;
  left: -999px;
  top: 0;
  z-index: 10;
  padding: 0.75rem 1.25rem;
  background: var(--k-panel);
  color: var(--k-text);
  border-radius: 0 0 0.75rem 0;
}
.skip-link:focus {
  left: 0;
}
:focus-visible {
  outline: 2px solid var(--k-brand);
  outline-offset: 2px;
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
  padding: 0.6rem clamp(1rem, 4vw, 3rem);
  background: color-mix(in srgb, var(--k-bg) 84%, transparent);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--k-line);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-height: var(--surface-tap-target);
  color: var(--k-text);
  font-family: var(--k-font-display);
  font-weight: 700;
  letter-spacing: -0.02em;
  text-decoration: none;
  font-size: 1.15rem;
  white-space: nowrap;
}
.logo {
  width: 1.6rem;
  height: 1.6rem;
  flex: none;
  color: var(--k-brand);
}
.repo-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--surface-tap-target);
  padding: 0 0.9rem;
  border: 1px solid var(--k-line);
  border-radius: 999px;
  color: var(--k-text-muted);
  text-decoration: none;
  font-size: 0.9rem;
}
.repo-link:hover {
  color: var(--k-text);
  background: var(--surface-panel);
}
.layout {
  position: relative;
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: clamp(1rem, 3vw, 3rem);
  width: min(1280px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2.5rem 0 4rem;
  align-items: start;
}
.site-nav {
  position: sticky;
  top: 5rem;
  max-height: calc(100vh - 6rem);
  overflow-y: auto;
  padding-right: 0.25rem;
}
.site-nav section,
.mobile-nav section {
  margin-bottom: 1.4rem;
}
.site-nav h2,
.mobile-nav h2 {
  margin: 0 0 0.35rem;
  font-family: var(--k-font-ui);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--k-text-muted);
}
.site-nav a,
.mobile-nav a {
  display: flex;
  align-items: center;
  min-height: 2.4rem;
  padding: 0.2rem 0.65rem;
  border-radius: 0.6rem;
  border: 1px solid transparent;
  color: var(--k-text-muted);
  text-decoration: none;
  font-size: 0.92rem;
  line-height: 1.3;
}
.site-nav a:hover,
.mobile-nav a:hover {
  color: var(--k-text);
  background: var(--surface-panel);
}
.site-nav a[aria-current="page"],
.mobile-nav a[aria-current="page"] {
  color: var(--k-text);
  border-color: var(--k-line);
  background: var(--surface-panel-raised);
  font-weight: 600;
}
.mobile-nav {
  display: none;
  border: 1px solid var(--k-line);
  border-radius: 1rem;
  background: var(--surface-panel);
}
.mobile-nav summary {
  display: flex;
  align-items: center;
  min-height: var(--surface-tap-target);
  padding: 0.4rem 1rem;
  cursor: pointer;
  font-weight: 600;
  list-style: none;
}
.mobile-nav summary::-webkit-details-marker { display: none; }
.mobile-nav summary::after {
  content: "";
  margin-left: auto;
  width: 0.55rem;
  height: 0.55rem;
  border-right: 2px solid var(--k-text-muted);
  border-bottom: 2px solid var(--k-text-muted);
  transform: rotate(45deg);
  transition: transform 160ms ease;
}
.mobile-nav[open] summary::after {
  transform: rotate(-135deg);
}
.mobile-nav nav {
  padding: 0.4rem 1rem 1rem;
  border-top: 1px solid var(--k-line);
}
.mobile-nav a {
  min-height: var(--surface-tap-target);
}
main {
  min-width: 0;
}
.hero {
  padding: clamp(1.5rem, 5vw, 4.5rem);
  border: 1px solid var(--k-line);
  border-radius: 2rem;
  background: linear-gradient(135deg, var(--surface-panel), color-mix(in srgb, var(--surface-panel) 70%, transparent));
  box-shadow: var(--k-shadow);
}
.eyebrow {
  margin-top: 0;
  color: var(--surface-accent-secondary);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
}
.hero h1 {
  max-width: 780px;
  font-size: clamp(2.3rem, 7vw, 4.8rem);
  line-height: 0.95;
  letter-spacing: -0.05em;
  margin: 0;
}
.hero p {
  max-width: 720px;
  font-size: clamp(1.05rem, 2.5vw, 1.2rem);
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.75rem;
}
.button-primary,
.button-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--surface-tap-target);
  padding: 0 1.4rem;
  border-radius: 999px;
  font-weight: 700;
  text-decoration: none;
}
.button-primary {
  background: var(--k-brand);
  color: var(--k-bg);
  border: 1px solid var(--k-brand);
}
.button-primary:hover {
  filter: brightness(1.08);
}
.button-secondary {
  color: var(--k-text);
  border: 1px solid var(--k-line);
  background: var(--surface-panel-raised);
}
.button-secondary:hover {
  border-color: var(--k-brand);
}
.hero-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(130px, 100%), 1fr));
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
  padding: clamp(1.25rem, 4vw, 3rem);
  border: 1px solid var(--k-line);
  border-radius: 1.5rem;
  background: var(--surface-panel);
  overflow-wrap: break-word;
}
.hero + article {
  margin-top: 2rem;
}
h1, h2, h3 {
  font-family: var(--k-font-display);
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
h1 { font-size: clamp(1.9rem, 5vw, 3.2rem); margin-top: 0; }
h2 { margin-top: 2.2rem; font-size: clamp(1.4rem, 4vw, 1.9rem); }
h3 { margin-top: 1.6rem; font-size: clamp(1.15rem, 3vw, 1.35rem); }
a { color: var(--k-brand); }
ol, ul {
  padding-left: 1.4rem;
}
li { margin: 0.25rem 0; }
.table-scroll {
  overflow-x: auto;
  margin: 1.5rem 0;
  border-radius: 0.75rem;
}
.table-scroll table {
  margin: 0;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
  overflow-wrap: anywhere;
  font-size: 0.95rem;
}
th, td {
  vertical-align: top;
  padding: 0.75rem;
  border: 1px solid var(--k-line);
  min-width: 7rem;
}
th {
  text-align: left;
  background: var(--surface-panel-raised);
}
code {
  font-family: var(--k-font-mono);
  font-size: 0.9em;
  overflow-wrap: anywhere;
}
pre {
  overflow-x: auto;
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid var(--k-line);
  background: var(--surface-code-bg);
}
pre code {
  overflow-wrap: normal;
  word-break: normal;
}
pre.mermaid {
  background: var(--surface-panel-raised);
  white-space: pre;
}
footer {
  position: relative;
  padding: 2.5rem 1.5rem calc(2.5rem + env(safe-area-inset-bottom));
  text-align: center;
  color: var(--k-text-muted);
  border-top: 1px solid var(--k-line);
}
.footer-tagline {
  margin: 0 0 0.5rem;
  font-family: var(--k-font-display);
  font-size: 1.2rem;
  color: var(--k-text);
}
.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
.footer-links a {
  display: inline-flex;
  align-items: center;
  min-height: var(--surface-tap-target);
  padding: 0 0.9rem;
  color: var(--k-text-muted);
}
.footer-links a:hover { color: var(--k-brand); }

@media (max-width: 919px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
    width: min(1280px, calc(100% - 1.5rem));
    padding-top: 1.25rem;
  }
  .site-nav { display: none; }
  .mobile-nav { display: block; }
  table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  pre {
    font-size: 0.85rem;
  }
  article, .hero {
    border-radius: 1.1rem;
  }
}

@media (max-width: 480px) {
  .repo-link { font-size: 0.85rem; padding: 0 0.7rem; }
  th, td { padding: 0.55rem; min-width: 6rem; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
`;
}
