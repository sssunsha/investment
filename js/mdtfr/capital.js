// js/mdtfr/capital.js
// 资金存取管理：总投入追踪、存入/抽出、历史流水、UI 刷新
import { _getRawKey, _setRawKey, saveAmounts } from './amounts.js';
import {
  getAvailableAmt, setAvailableAmt, saveAvailable,
  getTotalAmt, refreshTotalDisplay,
} from './available.js';
import { on } from './bus.js';

// ── 数据读写 ───────────────────────────────────────────────────

export function getNetCapital() {
  return parseFloat(_getRawKey('__net_capital__')) || 0;
}

function _setNetCapital(v) {
  _setRawKey('__net_capital__', parseFloat(v) || 0);
}

function _getCapitalLog() {
  const v = _getRawKey('__capital_log__');
  return Array.isArray(v) ? v : [];
}

function _appendLog(type, amt, note) {
  const log = _getCapitalLog();
  log.push({ ts: new Date().toISOString(), type, amt, note: note || '' });
  _setRawKey('__capital_log__', log);
}

// ── 存入 / 抽出 ────────────────────────────────────────────────

export async function deposit(amt, note) {
  if (!(amt > 0)) return;
  setAvailableAmt(getAvailableAmt() + amt);
  _setNetCapital(getNetCapital() + amt);
  _appendLog('deposit', amt, note);
  await saveAvailable();
  refreshTotalDisplay();
}

export async function withdraw(amt, note) {
  if (!(amt > 0)) return;
  const avail = getAvailableAmt();
  if (amt > avail) return;
  setAvailableAmt(avail - amt);
  _setNetCapital(getNetCapital() - amt);
  _appendLog('withdraw', amt, note);
  await saveAvailable();
  refreshTotalDisplay();
}

// ── 总投入 + 收益率标签刷新 ────────────────────────────────────

export function refreshNetCapitalDisplay() {
  const el = document.getElementById('mdtfr-net-capital');
  if (!el) return;
  const netCapital = getNetCapital();
  if (netCapital <= 0) { el.textContent = ''; return; }

  const total = getTotalAmt();
  const roi   = (total - netCapital) / netCapital;
  const roiPct = (roi * 100).toFixed(2);
  const sign  = roi >= 0 ? '+' : '';
  const clr   = roi > 0 ? 'var(--red)' : roi < 0 ? 'var(--green)' : 'var(--text-dim)';

  el.innerHTML =
    `总投入：<span style="color:var(--text-dim);font-weight:700">¥${Math.round(netCapital).toLocaleString()}</span>` +
    ` <span style="color:${clr};font-weight:700">${sign}${roiPct}%</span>`;
}

// 监听 available.js 发出的刷新事件（避免循环 import）
on('capital:refresh', refreshNetCapitalDisplay);

// ── 弹窗 ──────────────────────────────────────────────────────

let _activeTab = 'deposit';

export function openCapitalDialog() {
  const overlay = document.getElementById('capital-overlay');
  if (!overlay) return;
  _activeTab = 'deposit';
  _renderDialog();
  overlay.classList.add('open');
}

export function closeCapitalDialog() {
  document.getElementById('capital-overlay')?.classList.remove('open');
}

function _renderDialog() {
  const body = document.getElementById('capital-body');
  if (!body) return;

  const available = getAvailableAmt();
  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  const log = _getCapitalLog().slice().reverse().slice(0, 20);

  const tabStyle = (tab) =>
    `padding:6px 20px;border-radius:6px;border:none;font-size:13px;font-weight:600;cursor:pointer;` +
    (_activeTab === tab
      ? `background:rgba(99,102,241,.25);color:var(--purple);`
      : `background:transparent;color:var(--text-dim);`);

  const logRows = log.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:16px 0">暂无记录</td></tr>`
    : log.map(r => {
        const isDeposit = r.type === 'deposit';
        const dateStr = r.ts ? new Date(r.ts).toLocaleString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
        return `<tr>
          <td style="padding:6px 8px;font-size:12px;color:var(--text-dim)">${dateStr}</td>
          <td style="padding:6px 8px;font-size:12px">${isDeposit
            ? '<span style="color:var(--green)">🟢 存入</span>'
            : '<span style="color:var(--red)">🔴 抽出</span>'}</td>
          <td style="padding:6px 8px;font-size:12px;font-weight:700;color:${isDeposit ? 'var(--green)' : 'var(--red)'}">
            ${isDeposit ? '+' : '-'}${fmtY(r.amt)}</td>
          <td style="padding:6px 8px;font-size:12px;color:var(--text-dim)">${r.note || '–'}</td>
        </tr>`;
      }).join('');

  body.innerHTML = `
    <div style="padding:20px 24px 24px">
      <!-- Tabs -->
      <div style="display:flex;gap:4px;margin-bottom:20px;background:rgba(255,255,255,.04);border-radius:8px;padding:4px">
        <button style="${tabStyle('deposit')}"
          onclick="window._capitalSwitchTab('deposit')">存入</button>
        <button style="${tabStyle('withdraw')}"
          onclick="window._capitalSwitchTab('withdraw')">抽出</button>
      </div>

      <!-- 可用金额提示 -->
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px">
        当前可用金额：<span style="color:var(--yellow);font-weight:700">${fmtY(available)}</span>
      </div>

      <!-- 金额输入 -->
      <div style="margin-bottom:12px">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">金额（元）</div>
        <input id="capital-amt-input" type="number" min="1" step="100"
          placeholder="输入金额"
          oninput="window._capitalOnInput()"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:var(--surface2);color:var(--text);font-size:14px" />
        <div id="capital-amt-error" style="font-size:12px;color:var(--red);margin-top:4px;min-height:16px"></div>
      </div>

      <!-- 备注 -->
      <div style="margin-bottom:20px">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">备注（选填）</div>
        <input id="capital-note-input" type="text" maxlength="100"
          placeholder="如：月定投 / 临时调用"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:var(--surface2);color:var(--text);font-size:13px" />
      </div>

      <!-- 按钮 -->
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-bottom:24px">
        <button onclick="closeCapitalDialog()"
          style="padding:8px 18px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:transparent;color:var(--text-dim);font-size:13px;cursor:pointer">
          取消
        </button>
        <button id="capital-confirm-btn" disabled
          onclick="window._capitalConfirm()"
          style="padding:8px 20px;border-radius:6px;border:none;background:rgba(99,102,241,.5);color:#fff;font-size:13px;font-weight:700;cursor:not-allowed;opacity:0.5">
          ${_activeTab === 'deposit' ? '✅ 确认存入' : '✅ 确认抽出'}
        </button>
      </div>

      <!-- 历史流水 -->
      <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:16px">
        <div style="font-size:12px;font-weight:700;color:var(--text-dim);margin-bottom:8px">历史记录（最近 20 条）</div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="font-size:11px;color:var(--text-dim)">
              <th style="text-align:left;padding:4px 8px;font-weight:400">时间</th>
              <th style="text-align:left;padding:4px 8px;font-weight:400">类型</th>
              <th style="text-align:left;padding:4px 8px;font-weight:400">金额</th>
              <th style="text-align:left;padding:4px 8px;font-weight:400">备注</th>
            </tr>
          </thead>
          <tbody>${logRows}</tbody>
        </table>
      </div>
    </div>`;
}

window._capitalSwitchTab = function(tab) {
  _activeTab = tab;
  _renderDialog();
};

window._capitalOnInput = function() {
  const input = document.getElementById('capital-amt-input');
  const errEl = document.getElementById('capital-amt-error');
  const btn   = document.getElementById('capital-confirm-btn');
  const amt   = parseFloat(input?.value || '0') || 0;
  const available = getAvailableAmt();

  let error = '';
  if (amt <= 0) {
    error = '';
  } else if (_activeTab === 'withdraw' && amt > available) {
    error = `超过可用金额 ¥${Math.round(available).toLocaleString()}`;
  }

  if (errEl) errEl.textContent = error;
  const valid = amt > 0 && !error;
  if (btn) {
    btn.disabled      = !valid;
    btn.style.opacity = valid ? '1' : '0.5';
    btn.style.cursor  = valid ? 'pointer' : 'not-allowed';
    btn.style.background = valid ? 'rgba(99,102,241,.9)' : 'rgba(99,102,241,.5)';
  }
};

window._capitalConfirm = async function() {
  const input = document.getElementById('capital-amt-input');
  const note  = document.getElementById('capital-note-input')?.value?.trim() || '';
  const amt   = parseFloat(input?.value || '0') || 0;
  if (!(amt > 0)) return;

  const tab = _activeTab;
  if (tab === 'deposit') {
    await deposit(amt, note);
  } else {
    if (amt > getAvailableAmt()) return;
    await withdraw(amt, note);
  }

  closeCapitalDialog();

  const { showToast } = await import('./journal.js');
  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  const msg = tab === 'deposit'
    ? `✅ 已存入 ${fmtY(amt)}`
    : `✅ 已抽出 ${fmtY(amt)}`;
  showToast(msg, 'var(--purple)');
};
