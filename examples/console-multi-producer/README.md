# Console multi-producer merge demo

Three small producer bundles that merge into one Surface Console view. This is the
golden demo for `surface console --input` (repeatable), which mirrors
`surface report --input`: each bundle is validated, the bundles are merged
order-independently, and the merged ledger is projected into the console read model.

Launch the merged view (from the repo root):

```sh
npx surface console \
  --input examples/console-multi-producer/ci-producer.bundle.json \
  --input examples/console-multi-producer/review-producer.bundle.json \
  --input examples/console-multi-producer/security-producer.bundle.json
```

## What the fixtures exercise

| Bundle | `producerId` | Notable claims |
|--------|--------------|----------------|
| `ci-producer.bundle.json` | `ci-producer` | shared repo identity; verified unit-test suite; build artifact digest (`sha256:aaaa…`) |
| `review-producer.bundle.json` | `review-producer` | shared repo identity; verified human sign-off |
| `security-producer.bundle.json` | `security-producer` | shared repo identity; verified dependency audit; build artifact digest (`sha256:9999…`) |

- **Dedup + attribution.** `claim.shared.repo-identity` is byte-identical across all
  three producers, so it dedups to a single card that still attributes all three
  producers.
- **Collision (never silently dropped).** `claim.build.artifact-digest` carries a
  different digest in the CI and security bundles. The merge keeps the
  lexicographically-first content and surfaces the losing record in the console's
  "Merge collisions" section, naming both colliding producers.

A merged bundle never carries a top-level `producerId` (`merge.md` §5 rule 3), so
producer attribution is carried as projection metadata keyed by claim id, built
during the merge step — see `src/console/merged-read-model.ts`.
