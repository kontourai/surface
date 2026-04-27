# Use Cases

## Veritas

`veritas` is the developer-facing proof surface. It maps repo areas to proof lanes, policy packs, evidence artifacts, and eval history.

Surface should be able to represent claims like:

- This repo surface changed.
- This policy applies.
- This proof lane passed for this commit.
- This governance surface was or was not weakened.

Veritas artifacts can now carry `surface.input`, a portable Surface `TrustInput` projection. Surface still generates the final report, fault lines, proof requirements, and summary.

### Work-agent prove-out

`work-agent` is the brownfield proving ground for the Veritas-to-Surface boundary. It has repo governance proof lanes, proof-family inventories, policy packs, and connected-agent tests. The intended flow is:

```bash
WORK_AGENT_REPO=/path/to/work-agent
SURFACE_REPO=/path/to/kontourai/surface

cd "$WORK_AGENT_REPO"
npm exec -- veritas shadow run --working-tree --format feedback --run-id work-agent-surface-shadow
artifact_path="$(npm exec -- veritas report --working-tree --format json --run-id work-agent-surface-shadow | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { const parsed = JSON.parse(data); if (!parsed.artifactPath) throw new Error("missing artifactPath"); console.log(parsed.artifactPath); });')"
node "$SURFACE_REPO/bin/surface.mjs" report --adapter veritas --input "$artifact_path" --format summary
```

Proof lanes and proof families remain Veritas-local workflow mechanics. Their portable output is the Surface claim/evidence/policy/event input.

## Campfit

`campfit` is a public-data trust use case. Parents rely on camp details, registration status, pricing, schedules, and provider information.

Surface should be able to represent claims like:

- This field was sourced from a crawl.
- This blank value was explicitly attested as not applicable.
- This registration status is stale because the validity window expired.
- This user report conflicts with the approved value.

The `campfit` adapter now imports field sources, attestations, review flags, crawl outcomes, and proposals into the same Surface trust report shape.

## Taxes

`taxes` is a high-stakes fact-verification use case. The workflow extracts facts, resolves candidates, promotes verified facts, and emits return packages with citations and review signals.

Surface should be able to represent claims like:

- This value came from an imported document.
- This candidate won over alternatives.
- This fact was manually verified.
- This derived assumption still needs review.

The `taxes` adapter now imports verified facts, return-package citations, assumptions, comparison gaps, unresolved fields, and review signals into the same Surface trust report shape.

## Future products

## Reputation integrity

Reputation integrity covers projects where public signals can be useful but are easy to overinterpret. A repository star count can be observed, and a burst pattern can justify suspicion, but that does not prove owner intent or wrongdoing.

Surface should be able to represent claims like:

- This public popularity signal was observed from a source snapshot.
- This heuristic produced an anomaly that needs corroboration.
- This stronger accusation is unsupported until direct evidence exists.
- This workflow has an `unsupported_inference` fault line.

## Future products

Surface should also fit recommendation systems, marketplaces, local directories, compliance workflows, education data, health data, and any product where AI agents need trustworthy context before acting.
