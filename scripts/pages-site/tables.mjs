import { renderInline } from "./inline.mjs";

export function isTableHeader(line, nextLine) {
  return isTableRow(line) && isTableSeparator(nextLine ?? "");
}

export function isTableRow(line) {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

export function isTableSeparator(line) {
  if (!isTableRow(line)) return false;
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

export function renderTableHeader(line, source) {
  const headers = splitTableRow(line);
  return [
    "<table>",
    `<thead><tr>${headers.map((cell) => `<th>${renderInline(cell, source)}</th>`).join("")}</tr></thead>`,
    "<tbody>",
  ];
}

export function renderTableRow(line, source) {
  return `<tr>${splitTableRow(line).map((cell) => `<td>${renderInline(cell, source)}</td>`).join("")}</tr>`;
}

function splitTableRow(line) {
  const cells = [];
  let cell = "";
  let inCode = false;
  const content = line.trim().slice(1, -1);

  for (const char of content) {
    if (char === "`") {
      inCode = !inCode;
      cell += char;
    } else if (char === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}
