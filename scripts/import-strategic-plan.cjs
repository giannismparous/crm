#!/usr/bin/env node
/**
 * Regenerate src/content/strategicPlanHtml.el.ts from the founder Word document.
 *
 * Usage:
 *   node scripts/import-strategic-plan.cjs "/path/to/plan.docx"
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const docxPath = process.argv[2];
if (!docxPath) {
  console.error("Usage: node scripts/import-strategic-plan.cjs <path-to-docx>");
  process.exit(1);
}

const resolved = path.resolve(docxPath);
if (!fs.existsSync(resolved)) {
  console.error(`File not found: ${resolved}`);
  process.exit(1);
}

const outPath = path.join(__dirname, "..", "src", "content", "strategicPlanHtml.el.ts");
const py = `
import zipfile, xml.etree.ElementTree as ET, html as H, pathlib, sys
path = sys.argv[1]
out_path = pathlib.Path(sys.argv[2])
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

def text_of(el):
    return ''.join(t.text or '' for t in el.iter(W + 't'))

def runs_html(p):
    chunks = []
    for r in p.findall(W + 'r'):
        rpr = r.find(W + 'rPr')
        bold = rpr is not None and rpr.find(W + 'b') is not None
        italic = rpr is not None and rpr.find(W + 'i') is not None
        txt = text_of(r)
        if not txt: continue
        esc = H.escape(txt)
        if bold: esc = f'<strong>{esc}</strong>'
        if italic: esc = f'<em>{esc}</em>'
        chunks.append(esc)
    return ''.join(chunks)

def para_style(p):
    ppr = p.find(W + 'pPr')
    if ppr is None: return ''
    ps = ppr.find(W + 'pStyle')
    return ps.get(W + 'val', '') if ps is not None else ''

def is_list(p):
    ppr = p.find(W + 'pPr')
    return ppr is not None and ppr.find(W + 'numPr') is not None

with zipfile.ZipFile(path) as z:
    root = ET.fromstring(z.read('word/document.xml'))

out = []
for child in root.find(W + 'body'):
    tag = child.tag.split('}')[-1]
    if tag == 'p':
        line = runs_html(child).strip()
        if not line: continue
        style = para_style(child)
        if style == 'Heading1': out.append(f'<h1>{line}</h1>')
        elif style == 'Heading2': out.append(f'<h2>{line}</h2>')
        elif style == 'Heading3': out.append(f'<h3>{line}</h3>')
        elif is_list(child): out.append(f'<li>{line}</li>')
        else: out.append(f'<p>{line}</p>')
    elif tag == 'tbl':
        rows = []
        for tr in child.findall('.//' + W + 'tr'):
            cells = []
            for tc in tr.findall(W + 'tc'):
                cell_parts = [runs_html(p).strip() for p in tc.findall(W + 'p')]
                cell_parts = [c for c in cell_parts if c]
                cells.append('<td>' + '<br/>'.join(cell_parts) + '</td>' if cell_parts else '<td></td>')
            if cells: rows.append('<tr>' + ''.join(cells) + '</tr>')
        if rows: out.append('<table><tbody>' + ''.join(rows) + '</tbody></table>')

html_doc = []
i = 0
while i < len(out):
    if out[i].startswith('<li>'):
        items = []
        while i < len(out) and out[i].startswith('<li>'):
            items.append(out[i]); i += 1
        html_doc.append('<ul>' + ''.join(items) + '</ul>')
    else:
        html_doc.append(out[i]); i += 1

html = '\\n'.join(html_doc)
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(
    '/** Founder-only strategic plan — generated from the approved Word document. */\\n'
    'export const STRATEGIC_PLAN_HTML_EL = `\\n' + html + '\\n`;\\n',
    encoding='utf-8'
)
print('wrote', out_path, 'chars', len(html))
`;

execFileSync("python3", ["-c", py, resolved, outPath], { stdio: "inherit" });
