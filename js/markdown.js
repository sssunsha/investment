// js/markdown.js
import { escHtml } from './utils.js';

function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function buildList(lines, startIdx) {
  // 收集连续的列表项（包含缩进子项）
  let items = [];
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') break;
    const ulMatch = line.match(/^(\s*)[-*] (.+)$/);
    const olMatch = line.match(/^(\s*)\d+\. (.+)$/);
    if (ulMatch) { items.push({ indent: ulMatch[1].length, text: ulMatch[2], ordered: false }); i++; }
    else if (olMatch) { items.push({ indent: olMatch[1].length, text: olMatch[2], ordered: true }); i++; }
    else break;
  }
  if (!items.length) return '';

  function buildLevel(items, level) {
    let html = '';
    let j = 0;
    const tag = items[0]?.ordered ? 'ol' : 'ul';
    html += `<${tag}>`;
    while (j < items.length) {
      const item = items[j];
      html += `<li>${inline(item.text)}`;
      // 收集子项
      let children = [];
      j++;
      while (j < items.length && items[j].indent > item.indent) { children.push(items[j]); j++; }
      if (children.length) html += buildLevel(children, level + 1);
      html += '</li>';
    }
    html += `</${tag}>`;
    return html;
  }
  return buildLevel(items, 0);
}

function renderMarkdown(md) {
  const lines = md.split('\n');
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (line.startsWith('```')) {
      let code = '';
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { code += lines[i] + '\n'; i++; }
      html += `<pre><code>${escHtml(code.trimEnd())}</code></pre>`;
      i++;
      continue;
    }

    // 标题
    if (line.startsWith('### ')) { html += `<h3>${inline(line.slice(4))}</h3>`; i++; continue; }
    if (line.startsWith('## '))  { html += `<h2>${inline(line.slice(3))}</h2>`; i++; continue; }
    if (line.startsWith('# '))   { html += `<h1>${inline(line.slice(2))}</h1>`; i++; continue; }

    // 水平线
    if (line.trim() === '---') { html += '<hr>'; i++; continue; }

    // 表格
    if (line.startsWith('|')) {
      let rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const row = lines[i].trim();
        // 跳过分隔行
        if (!row.replace(/[\|\-\:\s]/g, '')) { i++; continue; }
        const cells = row.slice(1, -1).split('|').map(c => inline(c.trim()));
        rows.push(cells);
        i++;
      }
      if (rows.length) {
        const head = rows[0].map(c => `<th>${c}</th>`).join('');
        const body = rows.slice(1).map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('');
        html += `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
      }
      continue;
    }

    // 列表（有序/无序，支持嵌套缩进）
    if (/^(\s*)[-*] /.test(line) || /^(\s*)\d+\. /.test(line)) {
      html += buildList(lines, i);
      // 跳过已消耗的行
      while (i < lines.length && (/^(\s*)[-*] /.test(lines[i]) || /^(\s*)\d+\. /.test(lines[i]) || (lines[i].startsWith('  ') && i > 0))) {
        i++;
        if (i < lines.length && lines[i] === '') break;
      }
      continue;
    }

    // 空行
    if (line.trim() === '') { i++; continue; }

    // 普通段落
    html += `<p>${inline(line)}</p>`;
    i++;
  }
  return html;
}

export { renderMarkdown };
