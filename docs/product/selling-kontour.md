# Selling Kontour — What You're Actually Selling

**Internal enablement. Repo-only — not published to the docs site.** This is the
honest version of the pitch. Selling a *trust* product on inflated claims is
self-refuting; the guardrails at the bottom are not optional.

## The one sentence

**Kontour makes a verification result something the receiver can re-check for
themselves — with the evidence, an expiry, and their own standard — instead of a
badge they have to take on faith.**

## The buyer's pain (in their words)

- *"A vendor told us their AI passed its evals. We have a number. We can't see
  what was tested, and we can't tell if it's still true."*
- *"Our auditor wants continuous evidence now — screenshots and a point-in-time
  report don't cut it anymore."* (Directionally real: compliance-audit practice is
  shifting from point-in-time reports toward continuous, freshness-tested
  evidence.)
- *"When our own AI claims cross to a customer or a regulator, they land as a PDF.
  All the proof is gone."*

The through-line: **verification degrades to a badge the moment it crosses a
boundary, and a badge can't answer "is this still true right now?"**

## What it is (say it plainly)

A verification result travels as a *bundle* — the claim, the evidence behind it,
the policy for what counts as trustworthy, and an append-only history. The status
(verified / needs-refresh / disputed) isn't typed in by someone; it's **computed
from that bundle by a published rule anyone can re-run**, with *time as an input*,
so a good result decays honestly as the evidence ages. We call it **recomputable
trust**.

## Who buys, and why (lead with the first)

1. **AI assurance / audit / insurance — the funded wedge.** They deliver
   re-checkable evidence into enterprise vendor-risk reviews. The receiver
   *structurally cannot* re-run the vendor's evals, and point-in-time reports are
   already declared dead. Sell *under* an audit/attestation brand they accept
   (SOC 2 for AI, ISO 42001, CPA attestation) as the machine-readable, expiring,
   recomputable substrate behind it — not as a new format they have to bless.
2. **Enterprise AI procurement / risk / compliance.** "The vendor said it passed
   evals" is a named, litigated problem now. High volume, but format-conservative
   — they adopt what their checklist already recognizes, so ride the brand above.
3. **Agent ecosystems (incl. our MCP surface).** Greenfield, highest willingness,
   but earliest and smallest — no incumbent format blocks us, but budget is thin.
   Plant a flag; treat as the second beachhead, not the wedge.

## Why us, not the alternatives (the differentiation)

Everything else in this space **seals a statement** — it proves who signed what,
at a point in time. **We ship the appraisal, not just the signature.** A signature
proves a fact was asserted; it can't tell you the fact is *still* worth trusting
after the model, the data, or the policy moved. That "is it still true now?" gap is
the whole product.

Lead with the thing nobody else ships: a **calibrated confidence and an
in/out-of-distribution ("comfort zone") signal carried on the conclusion itself**,
across the boundary. No adopted AI-attestation format has it.

## Why now

- Regulators and auditors have all converged on **continuous** + **cross-boundary**
  evidence (EU AI Act post-market monitoring, NIST's manage loop, the shift toward
  continuous compliance evidence) — the two conditions that break sealed badges.
  *(None of them mandates recomputable trust yet — sell the trajectory, not a
  requirement; see Guardrails.)*
- AI raises the stakes: eval results are the highest-value place "trust me" stops
  being acceptable, and buyers are actively burned by unproven claims.

## Objection handles

- **"Isn't this just a signed attestation / SCITT?"** No. Those *seal* a statement
  and, by their own text, leave the trust decision to you. We ship the recomputable
  decision. They're transport and sealing; we ride on top of them.
- **"Isn't this just a policy engine (OPA/Cedar)?"** A policy engine runs whatever
  policy an author writes. We ship a *specific, published, versioned* trust
  function that everyone recomputes to the *same* answer. The engine is plumbing;
  the function is the product.
- **"Can the receiver really re-run our evals?"** Be honest: usually they re-derive
  the *status* under their policy at their now, over the evidence we carried — not
  always re-execute the eval (often infeasible). That's still strictly more than a
  frozen badge gives them, and it's the promise we keep.
- **"There's no standard for this."** Correct, and that's the opportunity — the
  format ([Hachure](https://github.com/hachure-org/spec)) is open and vendor-neutral
  by design, so adopting it isn't betting on a proprietary lock-in.

## Guardrails (do not cross)

- **Don't claim regulation requires this.** It doesn't yet — every framework still
  accepts maintained documents. We're *ahead of* the mandate, not filling a
  2026 checkbox. Sell the trajectory honestly.
- **Don't promise "re-run any eval."** Promise re-derivable *status*; see the
  objection handle above.
- **Don't oversell demand for the format.** The *problem* is funded; adoption of a
  *new format* is early. The credible motion is embedding under an assurance brand.
- **Don't dunk on the incumbents.** We compose with SCITT, Sigstore, in-toto,
  BOMs, VCs — they're evidence inputs, not enemies. "Better together" is the true
  and stronger story.

For the outward-facing versions: [Where Kontour Fits](where-kontour-fits.md)
(technical, cited) and [Start Here](start-here.md) (plain-language).
