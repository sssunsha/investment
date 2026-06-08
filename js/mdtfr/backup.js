// js/mdtfr/backup.js
// 备份管理弹窗：列出备份快照，支持恢复

import { escHtml } from '../utils.js';
import { loadAmounts, refreshAllPosPct } from './amounts.js';
import { loadAvailable, refreshTotalDisplay } from './available.js';
import { renderCorrectionStatus } from './corrections.js';

// 当前激活的 tab：'amounts' | 'journal'
let _activeTab = 'amounts';

export function openBackupDialog() {
  const overlay = document.getElementById('backup-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  _renderTabs();
  _loadList();
}

export function closeBackupDialog() {
  document.getElementById('backup-overlay')?.classList.remove('open');
}

function _renderTabs() {
  const tabs = document.getElementById('backup-tabs');
  if (!tabs) return;
  const mk = (type, label) => {
    const active = _activeTab === type;
    return `<button onclick="window._backupSwitchTab('${type}')"
      style="padding:6px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;
             border:1px solid ${active ? 'rgba(168,85,247,.6)' : 'rgba(255,255,255,.15)'};
             background:${active ? 'rgba(168,85,247,.15)' : 'transparent'};
             color:${active ? 'var(--purple)' : 'var(--text-dim)'}">
      ${label}
    </button>`;
  };
  tabs.innerHTML = mk('amounts', '📊 持仓 & 资金') + mk('journal', '📋 操作历史');
}

window._backupSwitchTab = function(type) {
  _activeTab = type;
  _renderTabs();
  _loadList();
};

async function _loadList() {
  const body = document.getElementById('backup-body');
  if (!body) return;
  body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0;text-align:center">加载中...</div>';
  try {
    const res = await fetch(`/api/cache/backup/list?type=${_activeTab}&limit=20`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();

    if (items.length === 0) {
      body.innerHTML = '<div style="color:var(--text-dim);padding:20px 0;text-align:center">暂无备份记录</div>';
      return;
    }

    const jth = t => `<th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap">${t}</th>`;
    const jtd = t => `<td style="padding:8px 10px;font-size:13px;border-bottom:1px solid rgba(255,255,255,.04)">${t}</td>`;

    const rows = items.map(item => {
      const dt   = new Date(item.ts);
      const tsStr = isNaN(dt) ? item.ts : `${dt.toLocaleDateString('zh-CN')} ${dt.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
      const extra = item.month ? `<span style="color:var(--text-dim);font-size:12px">${item.month}</span>` : '';
      return `<tr>
        ${jtd(`<span style="color:var(--text)">${tsStr}</span>`)}
        ${jtd(extra)}
        ${jtd(`<button onclick="window._backupRestore(${item.index})"
          style="padding:4px 12px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;
                 border:1px solid rgba(168,85,247,.4);background:rgba(168,85,247,.1);color:var(--purple)">
          恢复至此
        </button>`)}
      </tr>`;
    }).join('');

    body.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>${jth('备份时间')}${jth('附加信息')}${jth('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:12px;padding:10px 12px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:6px;font-size:12px;color:var(--yellow)">
        ⚠ 恢复操作不可逆。执行前当前状态会被自动备份一次。
      </div>`;
  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:20px 0">加载失败: ${escHtml(e.message)}</div>`;
  }
}

window._backupRestore = function(index) {
  const type = _activeTab;
  if (typeof window.showConfirm === 'function') {
    window.showConfirm(
      `确认恢复至该备份？\n当前状态将被自动备份后覆盖。`,
      async () => { await _doRestore(type, index); },
      '恢复'
    );
  } else {
    if (!confirm('确认恢复至该备份？当前状态将被自动备份后覆盖。')) return;
    _doRestore(type, index);
  }
};

async function _doRestore(type, index) {
  try {
    const res = await fetch('/api/cache/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, index }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // 恢复成功：刷新持仓/资金数据
    if (type === 'amounts') {
      await loadAmounts();
      await loadAvailable();
      refreshAllPosPct();
      refreshTotalDisplay();
      renderCorrectionStatus();
    }

    closeBackupDialog();

    // 显示 toast
    const { showToast } = await import('./journal.js');
    showToast(`✅ 已恢复至 ${data.restored_ts?.slice(0, 19) || '备份'}`, 'var(--green)');
  } catch(e) {
    const { showToast } = await import('./journal.js');
    showToast(`❌ 恢复失败: ${e.message}`, 'var(--red)');
  }
}
