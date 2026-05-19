import { registerAdapter } from "../adapter.js";
import type { TrustInput } from "../types.js";

registerAdapter({
  name: "surface",
  defaultFixture: "examples/surface-fixtures.json",
  adapt(record: unknown): TrustInput {
    return record as TrustInput;
  },
});
