import { normalize } from "node:path";

// Each entry: [slug, source, title, description].
// Descriptions feed the meta description and Open Graph tags for each page.
export const navGroups = [
  {
    label: "Start Here",
    pages: [
      [
        "index",
        "docs/index.md",
        "Overview",
        "Kontour Surface is the open trust format and transparency foundation that connects evidence provenance to the claims products ask humans and AI agents to trust.",
      ],
      [
        "getting-started",
        "docs/guides/getting-started.md",
        "Getting Started",
        "Install Kontour Surface, run your first trust report from example data, and emit your first producer claims with the TypeScript SDK.",
      ],
      [
        "walkthrough",
        "docs/guides/walkthrough.md",
        "Walkthrough",
        "A real Kontour Surface CLI session: generate a trust report, query stale claims and missing evidence, and drill into policy decisions.",
      ],
    ],
  },
  {
    label: "Product",
    pages: [
      [
        "start-here",
        "docs/product/start-here.md",
        "Start Here",
        "New to this space? The problem in plain terms — why verification degrades to a badge across a hand-off, how recomputable trust fixes it, and why it's useful.",
      ],
      [
        "vision",
        "docs/product/vision.md",
        "Vision",
        "Why product transparency matters in the AI era and the four questions Kontour Surface answers before anyone relies on a claim.",
      ],
      [
        "concepts",
        "docs/product/concepts.md",
        "Concepts",
        "The Kontour Surface trust vocabulary: claims, evidence traces, verification policies, freshness, conflicts, claim groups, and transparency gaps.",
      ],
      [
        "use-cases",
        "docs/product/use-cases.md",
        "Use Cases",
        "Where teams put Kontour Surface to work: AI code governance, field-attested public records, fact resolution, dependency audits, and agent guardrails.",
      ],
      [
        "principles",
        "docs/product/principles.md",
        "Principles",
        "The kernel principles behind Kontour Surface: unverified is not denied, deterministic by default, no single confidence score.",
      ],
      [
        "where-kontour-fits",
        "docs/product/where-kontour-fits.md",
        "Where Kontour Fits",
        "Kontour's place in the trust/attestation/provenance landscape, with adversarially-verified evidence: the recomputable-appraisal niche is unoccupied, and the AI-evaluation wedge.",
      ],
    ],
  },
  {
    label: "Build",
    pages: [
      [
        "consumer-sdk",
        "docs/guides/consumer-sdk.md",
        "Consumer SDK",
        "Emit valid TrustBundle from TypeScript with the fluent TrustBundleBuilder: claims, evidence, policies, events, and claim groups.",
      ],
      [
        "cli",
        "docs/reference/cli.md",
        "CLI",
        "The surface CLI reference: trust reports, output formats, claim queries, policy drilldowns, and the local Surface Console.",
      ],
      [
        "console",
        "docs/reference/console.md",
        "Surface Console",
        "Run the local Surface Console: a zero-cloud operator workspace for reviewing claims, evidence, policies, and transparency gaps.",
      ],
      [
        "mcp",
        "docs/reference/mcp.md",
        "Agents and MCP",
        "Serve portable trust state to AI agents over the Model Context Protocol: stale claims, missing evidence, policy drilldowns, and claim inspection as MCP tools.",
      ],
      [
        "trust-panel",
        "docs/reference/trust-panel.md",
        "Trust Panel Embed",
        "Embed the dependency-free surface-trust-panel web component so viewers can inspect claims, evidence, freshness, and gaps inside your product.",
      ],
      [
        "claim-authoring",
        "docs/reference/claim-authoring.md",
        "Claim Authoring",
        "Author claims in a committed claim store and manage them with the surface claim CLI commands.",
      ],
      [
        "adapters",
        "docs/reference/adapters.md",
        "Adapters",
        "Register producer adapters that translate product-native exports into portable Kontour Surface trust input.",
      ],
      [
        "extension-api",
        "docs/reference/extension-api.md",
        "Extension API",
        "Make Surface interfaces feel native to your product with producer extensions: branding, vocabulary, claim types, and policy templates.",
      ],
      [
        "analytics",
        "docs/reference/analytics.md",
        "Trust Analytics",
        "The trust analytics projection: provenance-aware coverage, stale claims, transparency gaps, and authority insight derived from trust reports.",
      ],
      [
        "schemas",
        "docs/reference/schemas.md",
        "Schemas",
        "JSON schema contracts for claims, evidence, verification policies, verification events, trust input, and trust reports.",
      ],
      [
        "schema-versioning",
        "docs/reference/schema-versioning.md",
        "Schema Versioning",
        "How Kontour Surface versions its schema contracts and how to migrate trust input between schema versions.",
      ],
      [
        "examples",
        "docs/reference/examples.md",
        "Examples",
        "The example trust inputs that double as regression contracts for the Kontour Surface kernel.",
      ],
    ],
  },
  {
    label: "Specs",
    pages: [
      [
        "open-trust-format",
        "docs/specs/open-trust-format.md",
        "Open Trust Format",
        "The portable claim package shape: schema-first, exportable, locally inspectable trust state with no proprietary hosted service required.",
      ],
      [
        "minimum-trust-panel",
        "docs/specs/minimum-trust-panel.md",
        "Minimum Trust Panel",
        "The minimum disclosure spec for a Surface Trust Panel: what a viewer must be able to inspect before relying on a product claim.",
      ],
      [
        "minimum-surface-console",
        "docs/specs/minimum-surface-console.md",
        "Minimum Surface Console",
        "The baseline operator capabilities a Surface Console must provide: claim inventory, evidence review, policy attachment, and gap queues.",
      ],
      [
        "disclosure-requirements",
        "docs/specs/disclosure-requirements.md",
        "Disclosure Requirements",
        "What trust information a product built with Surface must expose, independent of exact UI layout.",
      ],
      [
        "transparency-capabilities",
        "docs/specs/transparency-capabilities.md",
        "Transparency Capabilities",
        "Non-scored indicators of what a claim package supports: inspectable, anchored, signed, producer-reverifiable, independently verifiable.",
      ],
      [
        "producer-extension-limits",
        "docs/specs/producer-extension-limits.md",
        "Producer Extension Limits",
        "The customization boundary: producer extensions adapt vocabulary and branding but never redefine core trust semantics.",
      ],
      [
        "conformance",
        "docs/specs/conformance.md",
        "Conformance",
        "The conformance suite for the Open Trust Format: fixed inputs with the statuses and transparency gaps a conforming implementation must derive.",
      ],
      [
        "built-with-surface-badge",
        "docs/specs/built-with-surface-badge.md",
        "Built with Surface Badge",
        "The inspectability signal: what the Built with Surface badge means, what it does not, and the requirements for showing it.",
      ],
    ],
  },
  {
    label: "Architecture",
    pages: [
      [
        "architecture",
        "docs/architecture/index.md",
        "Architecture",
        "How the Kontour Surface kernel, adapters, trust snapshots, and Surface Console fit together as a local-first foundation.",
      ],
      [
        "developer-architecture",
        "docs/architecture/developer-architecture.md",
        "Developer Architecture",
        "The trust and evidence flow through Kontour Surface and the ownership boundaries between Surface and the products built on it.",
      ],
      [
        "surface-foundation",
        "docs/architecture/surface-foundation.md",
        "Surface Foundation",
        "The boundary rule that keeps Surface portable: trust semantics live in the kernel, workflow stays in products, dependencies point one way.",
      ],
      [
        "derivation-and-counterfactual-algorithms",
        "docs/architecture/derivation-and-counterfactual-algorithms.md",
        "Derivation & Counterfactual Algorithms",
        "How Surface bounds derived trust with the derivation ceiling, keeps status and gaps in agreement through one claim evaluation, and answers forward impact and reverse drilldown — with the soundness argument for each.",
      ],
    ],
  },
  {
    label: "Direction",
    pages: [
      [
        "roadmap",
        "docs/roadmap/index.md",
        "Roadmap",
        "What ships in Kontour Surface today and what comes next: hosted snapshot sinks, linked-data export, and resource contract alignment.",
      ],
    ],
  },
];

export const pages = navGroups.flatMap((group) => group.pages);
export const githubSourceBaseUrl = "https://github.com/kontourai/surface/blob/main/";
// Public base URL for canonical links, Open Graph URLs, and cross-page assets.
// Update here (one place) if the site moves to a custom domain.
export const siteBaseUrl = "https://kontourai.github.io/surface/";
export const pageSlugBySource = new Map(pages.map(([slug, source]) => [normalize(source), slug]));
