import { escapeHtml, renderInline } from "./inline.mjs";
import { isTableHeader, isTableRow, isTableSeparator, renderTableHeader, renderTableRow } from "./tables.mjs";

export function markdownToHtml(markdown, source) {
  const state = createRenderState(source);
  const lines = markdown.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    renderLine(state, lines[index], lines[index + 1]);
  }

  closeList(state);
  closeTable(state);
  return state.out.join("\n");
}

function createRenderState(source) {
  return {
    source,
    out: [],
    listType: null,
    inCode: false,
    inTable: false,
    codeLang: "",
    codeLines: [],
  };
}

function renderLine(state, line, nextLine) {
  if (line.startsWith("```")) return toggleCodeBlock(state, line);
  if (state.inCode) return state.codeLines.push(line);
  if (isTableHeader(line, nextLine)) return openTable(state, line);
  if (state.inTable && isTableSeparator(line)) return;
  if (state.inTable && isTableRow(line)) return state.out.push(renderTableRow(line, state.source));
  if (state.inTable) closeTable(state);

  if (line.startsWith("# ")) return renderHeading(state, "h1", line.slice(2));
  if (line.startsWith("## ")) return renderHeading(state, "h2", line.slice(3));
  if (line.startsWith("### ")) return renderHeading(state, "h3", line.slice(4));
  if (line.startsWith("- ")) return renderListItem(state, "ul", line.slice(2));
  if (/^\d+\.\s+/.test(line)) return renderListItem(state, "ol", line.replace(/^\d+\.\s+/, ""));
  if (line.trim() === "") return closeOpenBlocks(state);

  closeList(state);
  state.out.push(`<p>${renderInline(line, state.source)}</p>`);
}

function toggleCodeBlock(state, line) {
  if (!state.inCode) {
    closeList(state);
    state.inCode = true;
    state.codeLang = line.slice(3).trim();
    return;
  }

  const code = escapeHtml(state.codeLines.join("\n"));
  state.out.push(state.codeLang === "mermaid" ? `<pre class="mermaid">${code}</pre>` : `<pre><code>${code}</code></pre>`);
  state.codeLines = [];
  state.inCode = false;
  state.codeLang = "";
}

function openTable(state, line) {
  closeList(state);
  state.out.push(...renderTableHeader(line, state.source));
  state.inTable = true;
}

function renderHeading(state, tag, text) {
  closeList(state);
  state.out.push(`<${tag}>${renderInline(text, state.source)}</${tag}>`);
}

function renderListItem(state, type, text) {
  openList(state, type);
  state.out.push(`<li>${renderInline(text, state.source)}</li>`);
}

function openList(state, type) {
  if (state.listType === type) return;
  closeList(state);
  state.out.push(type === "ul" ? "<ul>" : "<ol>");
  state.listType = type;
}

function closeOpenBlocks(state) {
  closeList(state);
  closeTable(state);
}

function closeList(state) {
  if (state.listType === "ul") state.out.push("</ul>");
  if (state.listType === "ol") state.out.push("</ol>");
  state.listType = null;
}

function closeTable(state) {
  if (!state.inTable) return;
  state.out.push("</tbody></table>");
  state.inTable = false;
}
