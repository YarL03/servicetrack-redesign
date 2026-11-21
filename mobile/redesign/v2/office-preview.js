'use strict';
(() => {
  const E = Kontur.escape;
  const decoder = new TextDecoder();
  function xml(bytes) {
    const doc = new DOMParser().parseFromString(decoder.decode(bytes), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Некорректный документ');
    return doc;
  }
  const nodes = (parent, tag) => Array.from(parent.getElementsByTagNameNS('*', tag));
  const runs = (node) =>
    nodes(node, 't')
      .map((t) => t.textContent)
      .join('');

  // Read only the parts needed for an excerpt. Attached images stay compressed.
  function parts(buffer, names) {
    const files = fflate.unzipSync(buffer, {
      filter: (entry) => names.includes(entry.name) && entry.originalSize <= 8 * 1024 * 1024,
    });
    return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, xml(bytes)]));
  }

  Kontur.officeExcerpt = async (file) => {
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (/\.docx$/i.test(file.name)) {
      const name = 'word/document.xml';
      const paragraphs = nodes(parts(buffer, [name])[name], 'p').slice(0, 40);
      return paragraphs.map((p) => `<p>${E(runs(p))}</p>`).join('') || '<p>Пустой документ</p>';
    }
    const book = 'xl/workbook.xml',
      rels = 'xl/_rels/workbook.xml.rels';
    const files = parts(buffer, [book, rels]);
    const sheet = nodes(files[book], 'sheet')[0];
    const ref = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const relationship = nodes(files[rels], 'Relationship').find((r) => r.getAttribute('Id') === ref);
    const sheetPath = new URL(relationship.getAttribute('Target'), 'https://local.invalid/xl/').pathname.slice(1);
    const stringsPath = 'xl/sharedStrings.xml';
    const data = parts(buffer, [sheetPath, stringsPath]);
    const strings = data[stringsPath] ? nodes(data[stringsPath], 'si').map(runs) : [];
    const rows = nodes(data[sheetPath], 'row')
      .slice(0, 25)
      .map((row) => {
        const values = [];
        for (const cell of nodes(row, 'c')) {
          const letters = /^[A-Z]+/.exec(cell.getAttribute('r') || '')?.[0];
          const col = letters
            ? Array.from(letters).reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
            : values.length;
          if (col >= 10) continue;
          const raw = nodes(cell, 'v')[0]?.textContent || '';
          const type = cell.getAttribute('t');
          values[col] = type === 's' ? strings[Number(raw)] : type === 'inlineStr' ? runs(cell) : raw;
        }
        return `<tr>${Array.from(values, (v) => '<td>' + E(v || '') + '</td>').join('')}</tr>`;
      });
    return `<strong>${E(sheet.getAttribute('name'))}</strong><table><tbody>${rows.join('')}</tbody></table>`;
  };
})();
