# Linked Data Roadmap

Surface can grow into a small, stable, W3C-compatible vocabulary for claims, evidence, policies, verification events, and generated trust reports.

## Phase 1: JSON-LD Context

Ship a versioned `@context` for Surface reports so downstream products can publish linked reports without changing their native storage.

## Phase 2: SHACL Shapes

Publish SHACL shapes for the Surface vocabulary. A third party should be able to validate a `TrustInput` or linked `TrustReport` without running Surface TypeScript.

## Phase 3: Product-Layer Inheritance

Product vocabularies can import Surface and declare their own workflow concepts as subclasses or subproperties. Surface should not own those product vocabularies.

Example:

```ttl
product:ProofRun rdfs:subClassOf surface:VerificationEvent .
product:evidenceArtifact rdfs:subPropertyOf prov:generated .
```

## Phase 4: Optional RDF Emission

Add optional Turtle or N-Quads output for trust reports once the JSON-LD contract is stable.

## Phase 5: Reasoning And Credentials

Explore Verifiable Credentials and OWL reasoning only after the core vocabulary and shapes are stable enough to be useful without a hosted console.
