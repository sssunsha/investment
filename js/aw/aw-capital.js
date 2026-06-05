// js/aw/aw-capital.js
// AW 资金存取管理：总投入追踪、存入/抽出、历史流水、UI 刷新
import { getAwRawKey, setAwRawKey, saveAwAmounts } from './amounts.js';
import { getAwAvailableAmt, setAwAvailableAmt, getAwTotalAmt, refreshAwTotalDisplay } from './aw-available.js';

// ── 数据读写 ───────────────────────────────────────────────────

export function getAwNetCapital() {
  return parseFloat(getAwRawKey('__aw_net_capital__')) || 0;
}

function _setAwNetCapital(v) {
  setAwRawKey('__aw_net_capital__', parseFloat(v) || 0);
}

function _getAwCapitalLog() {
  const v = getAwRawKey('__aw_capital_log__');
  return Array.isArray(v) ? v : [];
}

function _appendLog(type, amt, note) {
  const log = _getAwCapitalLog();
  log.push({ ts: new Date().toISOString(), type, amt, note: note || '' });
  setAwRawKey('__aw_capital_log__', log);
}

// ── 存入 / 抽出 ────────────────────────────────────────────────

export async function awDeposit(amt, note) {
  if (!(amt > 0)) return;
  setAwAvailableAmt(getAwAvailableAmt() + amt);
  _setAwNetCapital(getAwNetCapital() + amt);
  _appendLog('deposit', amt, note);
  setAwRawKey('__available__', getAwAvailableAmt());
  await saveAwAmounts();
  refreshAwTotalDisplay();
}

export async function awWithdraw(amt, note) {
  if (!(amt > 0)) return;
  const avail = getAwAvailableAmt();
  if (amt > avail) return;
  setAwAvailableAmt(avail - amt);
  _setAwNetCapital(getAwNetCapital() - amt);
  _appendLog('withdraw', amt, note);
  setAwRawKey('__available__', getAwAvailableAmt());
  await saveAwAmounts();
  refreshAwTotalDisplay();
}

// ── 总投入 + 收益率标签刷新 ────────────────────────────────────

export function refreshAwNetCapitalDisplay() {
  const el = document.getElementById('aw-net-capital');
  if (!el) return;
  const netCapital = getAwNetCapital();
  if (netCapital <= 0) { el.textContent = ''; return; }

  const total  = getAwTotalAmt();
  const roi    = (total - netCapital) / netCapital;
  const roiPct = (roi * 100).toFixed(2);
  const sign   = roi >= 0 ? '+' : '';
  const clr    = roi > 0 ? 'var(--red)' : roi < 0 ? 'var(--green)' : 'var(--text-dim)';

  el.innerHTML =
    `总投入：<span style="color:var(--text-dim);font-weight:700">¥${Math.round(netCapital).toLocaleString()}</span>` +
    ` <span style="color:${clr};font-weight:700">${sign}${roiPct}%</span>`;
}

// ── 弹窗 ──────────────────────────────────────────────────────

let _activeTab = 'deposit';

export function openAwCapitalDialog() {
  const overlay = document.getElementById('aw-capital-overlay');
  if (!overlay) return;
  _activeTab = 'deposit';
  _renderDialog();
  overlay.classList.add('open');
}

export function closeAwCapitalDialog() {
  document.getElementById('aw-capital-overlay')?.classList.remove('open');
}

function _renderDialog() {
  const body = document.getElementById('aw-capital-body');
  if (!body) return;

  const available = getAwAvailableAmt();
  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  const log  = _getAwCapitalLog().slice().reverse().slice(0, 20);

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
      <div style="display:flex;gap:4px;margin-bottom:20px;background:rgba(255,255,255,.04);border-radius:8px;padding:4px">
        <button style="${tabStyle('deposit')}"
          onclick="window._awCapitalSwitchTab('deposit')">存入</button>
        <button style="${tabStyle('withdraw')}"
          onclick="window._awCapitalSwitchTab('withdraw')">抽出</button>
      </div>

      <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px">
        当前可用金额：<span style="color:var(--yellow);font-weight:700">${fmtY(available)}</span>
      </div>

      <div style="margin-bottom:12px">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">金额（元）</div>
        <input id="aw-capital-amt-input" type="number" min="1" step="100"
          placeholder="输入金额"
          oninput="window._awCapitalOnInput()"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:var(--surface2);color:var(--text);font-size:14px" />
        <div id="aw-capital-amt-error" style="font-size:12px;color:var(--red);margin-top:4px;min-height:16px"></div>
      </div>

      <div style="margin-bottom:20px">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">备注（选填）</div>
        <input id="aw-capital-note-input" type="text" maxlength="100"
          placeholder="如：月定投 / 临时调用"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:var(--surface2);color:var(--text);font-size:13px" />
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-bottom:24px">
        <button onclick="closeAwCapitalDialog()"
          style="padding:8px 18px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:transparent;color:var(--text-dim);font-size:13px;cursor:pointer">
          取消
        </button>
        <button id="aw-capital-confirm-btn" disabled
          onclick="window._awCapitalConfirm()"
          style="padding:8px 20px;border-radius:6px;border:none;background:rgba(99,102,241,.5);color:#fff;font-size:13px;font-weight:700;cursor:not-allowed;opacity:0.5">
          ${_activeTab === 'deposit' ? '✅ 确认存入' : '✅ 确认抽出'}
        </button>
      </div>

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

window._awCapitalSwitchTab = function(tab) {
  _activeTab = tab;
  _renderDialog();
};

window._awCapitalOnInput = function() {
  const input = document.getElementById('aw-capital-amt-input');
  const errEl = document.getElementById('aw-capital-amt-error');
  const btn   = document.getElementById('aw-capital-confirm-btn');
  const amt   = parseFloat(input?.value || '0') || 0;
  const avail = getAwAvailableAmt();

  const error = (_activeTab === 'withdraw' && amt > avail)
    ? `超过可用金额 ¥${Math.round(avail).toLocaleString()}`
    : '';

  if (errEl) errEl.textContent = error;
  const valid = amt > 0 && !error;
  if (btn) {
    btn.disabled         = !valid;
    btn.style.opacity    = valid ? '1' : '0.5';
    btn.style.cursor     = valid ? 'pointer' : 'not-allowed';
    btn.style.background = valid ? 'rgba(99,102,241,.9)' : 'rgba(99,102,241,.5)';
  }
};

window._awCapitalConfirm = async function() {
  const input = document.getElementById('aw-capital-amt-input');
  const note  = document.getElementById('aw-capital-note-input')?.value?.trim() || '';
  const amt   = parseFloat(input?.value || '0') || 0;
  if (!(amt > 0)) return;

  const tab = _activeTab;
  if (tab === 'deposit') {
    await awDeposit(amt, note);
  } else {
    if (amt > getAwAvailableAmt()) return;
    await awWithdraw(amt, note);
  }

  closeAwCapitalDialog();

  const fmtY = n => '¥' + Math.round(n).toLocaleString();
  const msg  = tab === 'deposit' ? `✅ 已存入 ${fmtY(amt)}` : `✅ 已抽出 ${fmtY(amt)}`;
  // 复用 aw-available 里的 showAwToast（已挂在 window 上）
  if (typeof window.showAwToast === 'function') window.showAwToast(msg);
};
