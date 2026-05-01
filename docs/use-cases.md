# Use Cases

## Veritas

`veritas` is the developer-facing proof surface. It maps repo areas to proof lanes, policy packs, evidence artifacts, and eval history.

Surface should be able to represent claims like:

- This repo surface changed.
- This policy applies.
- This proof lane passed for this commit.
- This governance surface was or was not weakened.

Veritas artifacts can now carry `surface.input`, a portable Surface `TrustInput` projection. Surface still generates the final report, fault lines, proof requirements, and summary.

### Veritas Prove-Out

A brownfield repository can prove the Veritas-to-Surface boundary with repo governance proof lanes, proof-family inventories, policy packs, and integration tests. The intended flow is:

```bash
TARGET_REPO=/path/to/repo
SURFACE_REPO=/path/to/kontourai/surface

cd "$TARGET_REPO"
npm exec -- veritas shadow run --working-tree --format feedback --run-id surface-shadow
artifact_path="$(npm exec -- veritas report --working-tree --format json --run-id surface-shadow | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { const parsed = JSON.parse(data); if (!parsed.artifactPath) throw new Error("missing artifactPath"); console.log(parsed.artifactPath); });')"
node "$SURFACE_REPO/bin/surface.mjs" report --adapter veritas --input "$artifact_path" --format summary
```

Proof lanes and proof families remain Veritas-local workflow mechanics. Their portable output is the Surface claim/evidence/policy/event input.

## Field-Attested Records

Field-attested records are a public-data trust pattern. Users rely on details, registration status, pricing, schedules, and provider information that may come from crawls, human edits, and review workflows.

Surface should be able to represent claims like:

- This field was sourced from a crawl.
- This blank value was explicitly attested as not applicable.
- This registration status is stale because the validity window expired.
- This user report conflicts with the approved value.

The generic example imports field sources, attestations, review flags, crawl outcomes, and proposals into the same Surface trust report shape. Real product adapters should live in the downstream product repo.

## Fact Resolution

Fact resolution is a high-stakes verification pattern. The workflow extracts facts, resolves candidates, promotes verified facts, and emits packages with citations and review signals.

Surface should be able to represent claims like:

- This value came from an imported document.
- This candidate won over alternatives.
- This fact was manually verified.
- This derived assumption still needs review.

The generic example imports verified facts, package citations, assumptions, comparison gaps, unresolved fields, and review signals into the same Surface trust report shape. Real product adapters should live in the downstream product repo.

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
