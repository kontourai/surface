# External Adapter Example

This package-shaped example shows how product code can use `@kontourai/surface` without putting product-specific logic inside the Surface repo.

Every adapter does three things:

1. Define the product input shape it accepts.
2. Map that input into Surface claims, evidence, policies, and verification events.
3. Emit valid `TrustInput` so Surface can build the same report shape as every other adapter.

The adapter is intentionally explicit. Surface does not discover adapters from `node_modules`; product packages register the adapters they want to expose.

Run it from the Surface repo with:

```bash
npm test -- external-adapter
```
