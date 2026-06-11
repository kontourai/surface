import { registerAdapter } from "../adapter.js";
import type { TrustBundle } from "../types.js";

registerAdapter({
  name: "surface",
  defaultFixture: "examples/surface-fixtures.json",
  adapt(record: unknown): TrustBundle {
    return record as TrustBundle;
  },
});
