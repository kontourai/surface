import { registerAdapter } from "../adapter.js";
import type { TrustBundle } from "../types.js";

registerAdapter({
  name: "surface",
  defaultExample: "examples/surface-example-bundle.json",
  adapt(record: unknown): TrustBundle {
    return record as TrustBundle;
  },
});
