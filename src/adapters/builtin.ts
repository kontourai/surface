import { registerAdapter } from "../adapter.js";
import { createEnvelopeAdapter } from "./envelope.js";
import type { TrustBundle } from "../types.js";

registerAdapter({
  name: "surface",
  defaultExample: "examples/surface-example-bundle.json",
  adapt(record: unknown): TrustBundle {
    return record as TrustBundle;
  },
});

// A thin preset of the generic envelope adapter: a Veritas evidence record
// carries the Trust Bundle at `trust.bundle`. Surface owns the neutral unwrap
// primitive; "veritas" is just this path preset (issue #84).
registerAdapter(createEnvelopeAdapter({ name: "veritas", unwrapPath: "trust.bundle" }));
