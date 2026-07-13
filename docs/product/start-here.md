# Start Here: The Problem, In Plain Terms

New to this space? Read this first. No jargon, three questions: what's broken, how
we fix it, and why it's useful.

## The problem: trust doesn't survive a hand-off

Every system that checks something — a test suite, a security scan, a compliance
review, a person signing off, an AI safety evaluation — reaches a conclusion and
stores it in its own database.

The trouble starts the moment that conclusion has to travel. When it crosses from
one team or company to another, it gets flattened into a **green checkmark, a
score, or a PDF**. Everything that made it trustworthy — *what* was checked, *what
evidence* backed it, *when* it was true, and *whether it's still true* — is left
behind.

So the person on the receiving end has two bad options: **take the badge on
faith, or redo all the work themselves.**

A few everyday versions of this:

- A vendor says "our AI passed its safety evals." You get a number. You can't see
  what was tested, and you can't tell if it's still true now that they've shipped
  a new model version.
- A security scanner says "no critical vulnerabilities." Six weeks later, is that
  still true? The badge doesn't know. It can't expire.
- An AI agent reports "I verified the change." Did it? Against what? You're
  trusting the sentence, not the evidence.

The badge can't answer *"is this still true right now?"* — because it was frozen
the instant it was created.

## How we fix it: trust you can re-check

Instead of shipping the *answer*, we ship the answer **together with everything
needed to re-derive it**:

- **the claim** — what's being asserted ("this model passes the safety eval");
- **the evidence** — what actually backs it (the test run, the data, the version);
- **the policy** — the rule for what counts as trustworthy (needs a second
  reviewer, valid for 30 days, and so on);
- **the history** — an append-only log of what happened (verified here, disputed
  there, a newer model shipped).

The status — verified, needs-refresh, disputed — is **not a value someone typed
in. It's computed from that bundle by a published rule that anyone can run.** Give
two people the same bundle and they get the same answer. And because time is one
of the inputs, a "verified" result can quietly turn to "needs refresh" on its own
as the evidence ages — no one has to remember to flip a switch.

We call it **recomputable trust**: not *portable* trust (a badge that travels),
but trust the receiver can **re-check for themselves**, at their own moment, under
their own standard.

## Why it's useful

- **You stop taking claims on faith.** The receiver can inspect the evidence and
  re-derive the verdict — or apply a stricter bar than the sender did.
- **Trust expires honestly.** "Valid until the model, the data, or the policy
  changes" is built in, instead of a stale badge that looks fine forever.
- **Disagreement is preserved, not hidden.** Two evaluators who reach different
  conclusions both stay on the record as a flagged conflict — never silently
  overwritten by whoever wrote last.
- **It plays well with what exists.** Signatures, transparency logs, and bills of
  materials aren't replaced — they ride along as evidence.

## Where this shows up first

The sharpest version is AI. As models and agents make higher-stakes calls, "trust
me, it passed the evals" stops being good enough — buyers, auditors, and
regulators increasingly need the evidence to travel *and* to stay checkable over
time. That's the wedge.

## Next

- The trust vocabulary in one page: [Concepts](concepts.md).
- How this sits among industry standards, with the evidence: [Where Kontour Fits](where-kontour-fits.md).
- Why it matters in the AI era: [Vision](vision.md).
