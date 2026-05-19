# Adapters

Surface adapters are for custom producers that own their full claim generation path and emit a complete `TrustInput`.

The only built-in adapter is `surface`, a passthrough for already formatted Surface input:

```bash
surface report --input examples/surface-fixtures.json
surface report --adapter surface --input path/to/trust-input.json
```

Custom adapters can still use the public registry:

```ts
import { registerAdapter } from "@kontourai/surface";

registerAdapter({
  name: "my-producer",
  adapt(record) {
    return record.surface.input;
  },
});
```

Surface no longer ships `npm-audit`, `field-attested-records`, or `fact-resolution` as built-in adapters. Producers that use authored claims should keep claims in a claim store and emit evidence per run. For npm audit-style evidence collection, use a Veritas plugin so the tool owner can own the evidence mapping.
