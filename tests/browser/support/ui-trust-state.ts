/**
 * The oracle for Surface's trust-state chips: @kontourai/ui's own
 * <k-trust-state> element, bundled from the installed package's public
 * `@kontourai/ui/elements` export and rendered in a blank page. Surface's
 * renderers (the Trust Panel and the Console client) must produce the same
 * markup, glyphs, and labels for the same input.
 */
import { build } from "esbuild";
import type { BrowserContext } from "@playwright/test";

export const TRUST_STATES = ["unknown", "proposed", "assumed", "verified", "stale", "disputed", "superseded", "rejected", "revoked"] as const;

export type TrustStateCase = { state: string; label?: string; detail?: string; className?: string };

let elementsBundle: Promise<string> | undefined;

function uiElementsBundle(): Promise<string> {
  elementsBundle ??= build({
    stdin: { contents: 'import "@kontourai/ui/elements";', resolveDir: process.cwd() },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
    logLevel: "silent",
  }).then((result) => result.outputFiles[0]!.text);
  return elementsBundle;
}

/** ui's rendered markup (the element's children) for each case, in order. */
export async function uiTrustStateMarkup(context: BrowserContext, cases: TrustStateCase[]): Promise<string[]> {
  const page = await context.newPage();
  try {
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: await uiElementsBundle() });
    return await page.evaluate(async (inputs) => {
      const elements = inputs.map((input) => {
        const element = document.createElement("k-trust-state");
        element.setAttribute("state", input.state);
        if (input.label !== undefined) element.setAttribute("label", input.label);
        if (input.detail !== undefined) element.setAttribute("detail", input.detail);
        if (input.className !== undefined) element.setAttribute("class-name", input.className);
        document.body.append(element);
        return element;
      });
      // The element renders in a queued microtask after connecting.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return elements.map((element) => element.innerHTML);
    }, cases);
  } finally {
    await page.close();
  }
}

/**
 * Removes attributes a Surface renderer adds for its adopters (e.g. the Trust
 * Panel's `part` and `data-kind`) from the chip root, so the rest can be
 * compared with ui's markup byte for byte.
 */
export function withoutRootAttributes(markup: string, names: string[]): string {
  const rootEnd = markup.indexOf(">");
  let root = markup.slice(0, rootEnd);
  for (const name of names) root = root.replace(new RegExp(` ${name}="[^"]*"`), "");
  return root + markup.slice(rootEnd);
}
