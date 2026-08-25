import { SURFACE_BASIS_VERSION, type BasisCompositionInput, type BasisContribution, type BasisOwnerRef, type BasisParseResult, type OwnerRead, type SafeDisplayProjection, type ThreadAnswerRef } from "./types.js";

export const BASIS_MAX_TOTAL_BYTES = 65_536;
export const BASIS_MAX_STRING_BYTES = 4_096;
export const BASIS_MAX_CONTRIBUTIONS = 64;
export const BASIS_MAX_FIELDS = 12;
const DISALLOWED_TEXT = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]|(?:https?:|javascript:|data:)/iu;
const VERIFYING_TONE = /\b(?:verified|approved|certified|trusted|passed)\b/iu;
type Parse<T> = { ok: true; value: T } | { ok: false; gap: { code: string; message: string } };

/** Parse the portable owner/context envelope.  Unknown shapes and versions fail closed. */
export function parseBasisComposition(input: unknown): BasisParseResult {
  if (!withinByteBudget(input)) return fail("oversize", "Basis input exceeds its total byte budget.");
  if (!objectWithExactKeys(input, ["version", "answer", "assessment", "contributions"])) return fail("invalid-shape", "Basis input has unknown or missing keys.");
  if (input.version !== SURFACE_BASIS_VERSION) return fail("unsupported-version", "Basis input version is unsupported.");
  const answer = parseThreadAnswerRef(input.answer);
  if (!answer.ok) return answer;
  const assessment = parseAssessmentRead(input.assessment);
  if (!assessment.ok) return assessment;
  if (!Array.isArray(input.contributions) || input.contributions.length > BASIS_MAX_CONTRIBUTIONS) return fail("invalid-contributions", "Basis contributions are invalid or exceed the cardinality budget.");
  const contributions: OwnerRead<readonly BasisContribution[]>[] = [];
  for (const candidate of input.contributions) {
    const parsed = parseContributionRead(candidate);
    if (!parsed.ok) return parsed;
    contributions.push(parsed.value);
  }
  return { ok: true, value: { version: SURFACE_BASIS_VERSION, answer: answer.value, assessment: assessment.value, contributions } };
}

export function parseThreadAnswerRef(input: unknown): Parse<ThreadAnswerRef> {
  if (!objectWithExactKeys(input, ["authority", "schemaVersion", "kind", "threadId", "messageId"])) return fail("invalid-thread-answer", "Thread answer reference has an invalid shape.");
  if (input.authority !== "@kontourai/thread" || input.schemaVersion !== "1.2.0" || input.kind !== "assistant-message" || !safeIdentifier(input.threadId) || !safeIdentifier(input.messageId)) return fail("invalid-thread-answer", "Thread answer reference is not a supported canonical assistant message.");
  return { ok: true, value: { authority: input.authority, schemaVersion: input.schemaVersion, kind: input.kind, threadId: input.threadId, messageId: input.messageId } };
}

function parseAssessmentRead(input: unknown): Parse<OwnerRead<import("./types.js").AnswerAssessmentProjection>> {
  // Assessment stays typed-only. JSON fixtures may declare its availability state,
  // but a TrustReport projection is built in-process via buildAnswerAssessmentProjection.
  if (isObject(input) && input.state === "available") return fail("invalid-assessment", "Available assessments must be built from a typed TrustReport projection.");
  return parseRead(input, () => fail("invalid-assessment", "Available assessments must be built from a typed TrustReport projection."));
}

function parseContributionRead(input: unknown): Parse<OwnerRead<readonly BasisContribution[]>> {
  return parseRead(input, (value, owner) => {
    if (!Array.isArray(value) || value.length > BASIS_MAX_CONTRIBUTIONS) return fail("invalid-contributions", "Contribution read value is invalid.");
    const contributions: BasisContribution[] = [];
    for (const candidate of value) {
      const parsed = parseContribution(candidate);
      if (!parsed.ok) return parsed;
      if (!sameOwner(parsed.value.owner, owner)) return fail("owner-mismatch", "Contribution owner must equal its owner-read authority.");
      contributions.push(parsed.value);
    }
    return { ok: true, value: contributions };
  });
}

function parseRead<T>(input: unknown, parseValue: (value: unknown, owner: BasisOwnerRef) => Parse<T>): Parse<OwnerRead<T>> {
  if (!isObject(input) || !Object.hasOwn(input, "owner") || !Object.hasOwn(input, "state")) return fail("invalid-owner-read", "Owner read has an invalid shape.");
  const owner = parseOwner(input.owner);
  if (!owner.ok) return owner;
  const state = input.state;
  if (state === "available") {
    if (!objectWithExactKeys(input, ["owner", "state", "value"])) return fail("invalid-owner-read", "Available owner reads require only value.");
    const value = parseValue(input.value, owner.value);
    return value.ok ? { ok: true, value: { owner: owner.value, state, value: value.value } } : value;
  }
  if (state === "observed-empty") {
    if (!objectWithExactKeys(input, ["owner", "state", "value"]) || !Array.isArray(input.value) || input.value.length !== 0) return fail("invalid-owner-read", "Observed-empty reads carry only an empty value.");
    return { ok: true, value: { owner: owner.value, state, value: [] } as unknown as OwnerRead<T> };
  }
  if (!["not-captured", "restricted", "stale", "corrupt", "unsupported-version", "unavailable"].includes(String(state)) || !objectWithExactKeys(input, ["owner", "state"])) return fail("invalid-owner-read", "Owner read state is invalid or leaks detail.");
  return { ok: true, value: { owner: owner.value, state } as OwnerRead<T> };
}

function parseContribution(input: unknown): Parse<BasisContribution> {
  if (!objectWithExactKeys(input, ["id", "owner", "answer", "role", "display"]) || !safeIdentifier(input.id)) return fail("invalid-contribution", "Contribution has an invalid shape.");
  const owner = parseOwner(input.owner); const answer = parseThreadAnswerRef(input.answer); const display = parseDisplay(input.display);
  if (!owner.ok) return owner; if (!answer.ok) return answer; if (!display.ok) return display;
  if (!(["input", "execution", "process", "outcome", "source", "live"] as const).includes(input.role as never)) return fail("invalid-contribution", "Contribution role is unsupported.");
  return { ok: true, value: { id: input.id, owner: owner.value, answer: answer.value, role: input.role as BasisContribution["role"], display: display.value } };
}

function parseDisplay(input: unknown): Parse<SafeDisplayProjection> {
  if (!isObject(input) || !Object.keys(input).every((key) => ["title", "summary", "fields", "status"].includes(key)) || !safeText(input.title)) return fail("unsafe-display", "Display data is invalid or unsafe.");
  if (input.summary !== undefined && !safeText(input.summary)) return fail("unsafe-display", "Display summary is unsafe.");
  if (input.status !== undefined && !(["available", "observed", "pending", "unavailable"] as const).includes(input.status as never)) return fail("unsafe-display", "Display status is unsupported.");
  if (input.fields !== undefined && (!Array.isArray(input.fields) || input.fields.length > BASIS_MAX_FIELDS || input.fields.some((field: unknown) => !objectWithExactKeys(field, ["label", "value"]) || !safeText(field.label) || !safeText(field.value)))) return fail("unsafe-display", "Display fields are invalid or unsafe.");
  return { ok: true, value: { title: input.title, ...(input.summary === undefined ? {} : { summary: input.summary }), ...(input.fields === undefined ? {} : { fields: input.fields.map((field: Record<string, any>) => ({ label: field.label, value: field.value })) }), ...(input.status === undefined ? {} : { status: input.status }) } };
}

function parseOwner(input: unknown): Parse<BasisOwnerRef> {
  if (!objectWithExactKeys(input, ["authority", "schemaVersion", "kind", "component"])) return fail("invalid-owner", "Owner reference has an invalid shape.");
  const value = input as Record<string, unknown>;
  const valid = (value.authority === "@kontourai/thread" && value.schemaVersion === "1.2.0" && value.kind === "result" && value.component === "thread")
    || (value.authority === "@kontourai/flow-agents" && value.schemaVersion === "1" && value.kind === "narrative" && value.component === "flow-agents")
    || (value.authority === "@kontourai/flow" && value.schemaVersion === "1" && value.kind === "gate-evaluation" && value.component === "flow")
    || (value.authority === "@kontourai/survey" && value.schemaVersion === "1" && value.kind === "review" && value.component === "survey")
    || (value.authority === "@kontourai/station" && value.schemaVersion === "1" && ["input", "task-output", "live"].includes(String(value.kind)) && value.component === "station");
  return valid ? { ok: true, value: value as BasisOwnerRef } : fail("unsupported-owner-version", "Owner authority, kind, component, or version is unsupported.");
}

function isObject(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function objectWithExactKeys(value: unknown, keys: readonly string[]): value is Record<string, any> { return isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function safeText(value: unknown): value is string { return typeof value === "string" && value === value.normalize("NFC") && Buffer.byteLength(value, "utf8") > 0 && Buffer.byteLength(value, "utf8") <= BASIS_MAX_STRING_BYTES && !DISALLOWED_TEXT.test(value) && !VERIFYING_TONE.test(value); }
function safeIdentifier(value: unknown): value is string { return typeof value === "string" && value === value.normalize("NFC") && Buffer.byteLength(value, "utf8") > 0 && Buffer.byteLength(value, "utf8") <= BASIS_MAX_STRING_BYTES && !DISALLOWED_TEXT.test(value); }
function withinByteBudget(value: unknown): boolean {
  const visit = (candidate: unknown): number | null => {
    if (candidate === null || typeof candidate === "boolean") return 5;
    if (typeof candidate === "string") return Buffer.byteLength(candidate, "utf8") + 2;
    if (typeof candidate === "number") return Number.isFinite(candidate) ? 24 : null;
    if (Array.isArray(candidate)) {
      let size = 2;
      for (const item of candidate) { const itemSize = visit(item); if (itemSize === null) return null; size += itemSize + 1; if (size > BASIS_MAX_TOTAL_BYTES) return null; }
      return size;
    }
    if (!isObject(candidate)) return null;
    let size = 2;
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(candidate))) {
      if (!("value" in descriptor)) return null;
      const itemSize = visit(descriptor.value);
      if (itemSize === null) return null;
      size += Buffer.byteLength(key, "utf8") + itemSize + 3;
      if (size > BASIS_MAX_TOTAL_BYTES) return null;
    }
    return size;
  };
  const bytes = visit(value);
  return bytes !== null && bytes <= BASIS_MAX_TOTAL_BYTES;
}
function sameOwner(left: BasisOwnerRef, right: BasisOwnerRef): boolean { return left.authority === right.authority && left.schemaVersion === right.schemaVersion && left.kind === right.kind && left.component === right.component; }
function fail(code: string, message: string): { ok: false; gap: { code: string; message: string } } { return { ok: false, gap: { code, message } }; }
