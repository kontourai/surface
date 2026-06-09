import { buildTrustAnalyticsProjection } from "../analytics.js";
import { toLinkedReport } from "../linked.js";
import { formatTrustReportSummary } from "../report.js";
import { loadReport, parseReportArgs } from "./shared.js";

export async function runReport(args: string[]): Promise<void> {
  const options = parseReportArgs(args);
  const report = await loadReport(options);

  if (options.format === "summary") {
    console.log(formatTrustReportSummary(report));
  } else if (options.format === "linked") {
    console.log(JSON.stringify(toLinkedReport(report), null, 2));
  } else if (options.format === "analytics") {
    console.log(JSON.stringify(buildTrustAnalyticsProjection(report), null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}
