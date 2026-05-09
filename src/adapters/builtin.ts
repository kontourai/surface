import { registerAdapter } from "../adapter.js";
import { adaptFactResolutionExportToTrustInput } from "../../examples/adapters/fact-resolution.js";
import { adaptFieldAttestedRecordsExportToTrustInput } from "../../examples/adapters/field-attested-records.js";
import type { TrustInput } from "../types.js";

registerAdapter({
  name: "surface",
  defaultFixture: "examples/surface-fixtures.json",
  adapt(record: unknown): TrustInput {
    return record as TrustInput;
  },
});

registerAdapter({
  name: "field-attested-records",
  defaultFixture: "examples/field-attested-records-export.json",
  adapt: adaptFieldAttestedRecordsExportToTrustInput,
});

registerAdapter({
  name: "fact-resolution",
  defaultFixture: "examples/fact-resolution-export.json",
  adapt: adaptFactResolutionExportToTrustInput,
});
