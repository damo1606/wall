const fs = require('fs');
const path = require('path');

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error('Usage: node md-to-html.js <input.md> <output.html>');
  process.exit(1);
}

const md = fs.readFileSync(input, 'utf8');

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s) {
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|\s)\*([^*\s][^*]*[^*\s]|[^*\s])\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

const lines = md.split(/\r?\n/);
let html = '';
let inTable = false;
let tableHeader = false;
let inCode = false;
let inList = false;
let listType = null;

function closeList() {
  if (inList) {
    html += listType === 'ul' ? '</ul>\n' : '</ol>\n';
    inList = false;
    listType = null;
  }
}

function closeTable() {
  if (inTable) {
    html += '</tbody></table>\n';
    inTable = false;
    tableHeader = false;
  }
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (line.startsWith('```')) {
    closeList();
    closeTable();
    if (inCode) { html += '</code></pre>\n'; inCode = false; }
    else { html += '<pre><code>'; inCode = true; }
    continue;
  }
  if (inCode) { html += esc(line) + '\n'; continue; }

  if (/^\s*\|.*\|\s*$/.test(line)) {
    const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
    if (i + 1 < lines.length && /^\s*\|[\s\-:|]+\|\s*$/.test(lines[i + 1])) {
      closeList();
      closeTable();
      html += '<table><thead><tr>';
      for (const c of cells) html += `<th>${inline(esc(c))}</th>`;
      html += '</tr></thead><tbody>\n';
      inTable = true;
      tableHeader = true;
      i++;
      continue;
    }
    if (inTable) {
      html += '<tr>';
      for (const c of cells) html += `<td>${inline(esc(c))}</td>`;
      html += '</tr>\n';
      continue;
    }
  } else {
    closeTable();
  }

  if (/^#{1,6}\s/.test(line)) {
    closeList();
    const level = line.match(/^#+/)[0].length;
    const text = line.replace(/^#+\s/, '');
    html += `<h${level}>${inline(esc(text))}</h${level}>\n`;
    continue;
  }

  if (/^---+\s*$/.test(line)) {
    closeList();
    html += '<hr/>\n';
    continue;
  }

  const ulMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
  const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
  if (ulMatch || olMatch) {
    const m = ulMatch || olMatch;
    const type = ulMatch ? 'ul' : 'ol';
    if (!inList || listType !== type) {
      closeList();
      html += type === 'ul' ? '<ul>\n' : '<ol>\n';
      inList = true;
      listType = type;
    }
    html += `<li>${inline(esc(m[2]))}</li>\n`;
    continue;
  }

  if (line.trim() === '') {
    closeList();
    continue;
  }

  closeList();
  html += `<p>${inline(esc(line))}</p>\n`;
}

closeList();
closeTable();
if (inCode) html += '</code></pre>\n';

const css = `
@page { size: Letter; margin: 1in; }
body {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.5;
  color: #1a1a1a;
  max-width: 100%;
  margin: 0;
  padding: 0;
}
h1 { font-size: 22pt; font-weight: 800; margin: 0 0 8pt 0; letter-spacing: -0.5px; border-bottom: 1.5pt solid #1a1a1a; padding-bottom: 6pt; page-break-after: avoid; }
h2 { font-size: 15pt; font-weight: 700; margin: 22pt 0 8pt 0; color: #1a1a1a; page-break-after: avoid; }
h3 { font-size: 12pt; font-weight: 700; margin: 14pt 0 6pt 0; color: #2a2a2a; page-break-after: avoid; }
h4 { font-size: 11pt; font-weight: 600; margin: 10pt 0 4pt 0; }
p  { margin: 0 0 7pt 0; text-align: left; }
ul, ol { margin: 4pt 0 8pt 0; padding-left: 20pt; }
li { margin-bottom: 3pt; }
hr { border: none; border-top: 0.5pt solid #999; margin: 14pt 0; }
code {
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 9pt;
  background: #f2f2f2;
  padding: 1pt 4pt;
  border-radius: 3pt;
  color: #6a3a8a;
}
pre {
  background: #f5f5f5;
  padding: 8pt 10pt;
  border-radius: 4pt;
  overflow-x: auto;
  page-break-inside: avoid;
  font-size: 9pt;
}
pre code { background: none; padding: 0; color: #1a1a1a; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 8pt 0 12pt 0;
  font-size: 9.5pt;
  page-break-inside: avoid;
}
th { background: #1a1a1a; color: #fff; padding: 5pt 7pt; text-align: left; font-weight: 600; }
td { padding: 4pt 7pt; border-bottom: 0.4pt solid #ddd; vertical-align: top; }
tr:nth-child(even) td { background: #fafafa; }
strong { font-weight: 700; color: #000; }
em { font-style: italic; }
a { color: #1a4a8a; text-decoration: none; }
`;

const out = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${path.basename(input, '.md')}</title><style>${css}</style></head><body>${html}</body></html>`;

fs.writeFileSync(output, out, 'utf8');
console.log(output);
