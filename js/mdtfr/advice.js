// js/mdtfr/advice.js
// 操作建议生成与渲染：mdtfrBuildAdvice / mdtfrRenderAdvice
import { escHtml } from '../utils.js';
import { getAmt, getPosVal, setLastMdtfrItems } from './amounts.js';
import { getTotalAmt } from './available.js';
import { getWatchState } from './watch.js';

// 防守模式可选标的（C类代码）：沪深300、中证500、红利低波动、黄金
const DEFENSE_CODES = new Set(['006131', '006382', '007467', '000217']);

// 当前建议数据（供 journal.js 读取后保存）
let _lastAdviceData = null;
// 供 main.js 在初始化时注册，避免 advice → journal 循环依赖
let _journalSaver = null;

export function getLastAdviceData() { return _lastAdviceData; }
export function setJournalSaver(cb) { _journalSaver = cb; }

export function mdtfrBuildAdvice(items) {
  const valid = items.filter(x => !x.error && x.ret_20d != null && x.latest_close != null);
  if (valid.length === 0) return null;

  // ── 市场模式判断（两个独立 OR 条件）────────────────────
  const hs300 = valid.find(x => x.code_c === '006131');
  const cond1 = !!(hs300 && hs300.ma60 != null && hs300.latest_close > hs300.ma60);
  const aboveMa20Count = valid.filter(x => x.above_ma20).length;
  const aboveMa20Pct   = valid.length > 0 ? aboveMa20Count / valid.length : 0;
  const cond2 = aboveMa20Pct >= 0.8;
  const isAttack = cond1 || cond2;

  // 两个条件的文字说明（供 condRow 使用）
  const modeCond1Text = `沪深300 收盘价 > 60日均线（主条件）`;
  const modeCond1Note = hs300 && hs300.ma60 != null
    ? `收盘 ${hs300.latest_close?.toFixed(3)} ${cond1?'>':'≤'} MA60 ${hs300.ma60?.toFixed(3)}`
    : '数据不足';
  const modeCond2Text = `≥ 80% 标的收盘价站在20日均线上方（辅助条件）`;
  const modeCond2Note = `${aboveMa20Count}/${valid.length} 只站上MA20（${(aboveMa20Pct*100).toFixed(0)}%，阈值80%）`;

  // ── 候选池（基于模式筛选）────────────────────────────
  const pool = isAttack ? valid : valid.filter(x => DEFENSE_CODES.has(x.code_c));
  const ranked = [...pool].sort((a, b) => b.ret_20d - a.ret_20d);
  ranked.forEach((x, i) => { x._poolRank = i + 1; });

  // ── 买入筛选（只取前2，四条须同时满足）────────────────
  const top2 = ranked.slice(0, 2);
  top2.forEach(x => {
    x._c1 = x._poolRank <= 2;
    x._c2 = x.ret_20d != null && x.ret_20d >= 0.03;
    x._c3 = x.above_ma20 === true;
    x._c4 = x.ma60_rising === true;
    x._allPass = x._c1 && x._c2 && x._c3 && x._c4;
  });
  const buyCandidates = top2.filter(x => x._allPass);

  // ── 全局排名（先于持仓计算，确保 _globalRank 写入原对象）──
  const allRanked = [...valid].sort((a,b) => b.ret_20d - a.ret_20d);
  allRanked.forEach((x, i) => { x._globalRank = i + 1; });

  // ── 持仓（从全局 _amt 读取；此时 valid 对象已含 _globalRank）──
  const holdings = valid.filter(x => getAmt(x.code_c) > 0)
    .map(x => ({ ...x, _posVal: getPosVal(x.code_c), _amt: getAmt(x.code_c) }));

  // 条件1：趋势破位（跌破MA20）
  const sellBelowMa20 = holdings.filter(x => x.above_ma20 === false);
  // 条件2：排名跌出前6
  const sellOutTop6   = holdings.filter(x => x._globalRank > 6);
  // 条件3/4：仓位/止损需人工确认

  return {
    isAttack, cond1, cond2,
    modeCond1Text, modeCond1Note, modeCond2Text, modeCond2Note,
    pool, ranked, top2, buyCandidates,
    holdings, sellBelowMa20, sellOutTop6,
    valid, aboveMa20Count, aboveMa20Pct, hs300,
  };
}

export function mdtfrRenderAdvice(items) {
  const card  = document.getElementById('mdtfr-advice-card');
  const body  = document.getElementById('mdtfr-advice-body');
  const tspan = document.getElementById('mdtfr-advice-time');
  if (!card || !body) return;

  setLastMdtfrItems(items);
  const advice = mdtfrBuildAdvice(items);
  if (!advice) { card.style.display = 'none'; return; }

  tspan.textContent = `分析时间: ${new Date().toTimeString().slice(0,8)}`;
  const {
    isAttack, cond1, cond2,
    modeCond1Text, modeCond1Note, modeCond2Text, modeCond2Note,
    pool, ranked, top2, buyCandidates,
    holdings, sellBelowMa20, sellOutTop6, valid,
  } = advice;

  const fmtRet  = (r) => r != null ? (r>0?'+':'') + (r*100).toFixed(2) + '%' : '–';
  const rclr    = (r) => r == null ? 'var(--text-dim)' : r > 0 ? 'var(--red)' : 'var(--green)';

  // 条款行：✓ 白色 / ✗ 灰色 / ○ 灰色
  const condRow = (pass, docText, note) => {
    const icon = pass === true ? '✓' : pass === false ? '✗' : '○';
    const iclr = pass === true ? 'var(--green)' : pass === false ? 'var(--red)' : 'var(--text-dim)';
    const tclr = pass === true ? 'var(--text)' : 'var(--text-dim)';
    return `<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);align-items:flex-start">
      <span style="color:${iclr};font-size:14px;flex-shrink:0;width:16px;margin-top:1px">${icon}</span>
      <div style="flex:1;min-width:0">
        <span style="color:${tclr};font-size:13px">${docText}</span>
        ${note ? `<span style="color:var(--text-dim);font-size:12px;margin-left:6px">— ${note}</span>` : ''}
      </div>
    </div>`;
  };

  // ── 1. 综合操作结论（合并买入+卖出信号）──────────────────
  const totalAmt    = getTotalAmt();
  const fmtY        = (n) => '¥' + Math.round(n).toLocaleString();

  // ── 金额颜色标注 helper ──────────────────────────────────
  const hiGreen  = (t) => `<span style="color:var(--green);font-weight:700">${t}</span>`;
  const hiRed    = (t) => `<span style="color:var(--red);font-weight:700">${t}</span>`;
  const hiYellow = (t) => `<span style="background:rgba(245,158,11,.18);color:var(--yellow);font-weight:700;padding:1px 6px;border-radius:3px">${t}</span>`;
  const hiLaser  = (t) => `<span style="color:#ff4d4d;font-weight:700;text-shadow:0 0 8px rgba(255,77,77,.8)">${t}</span>`;
  const hiPurple = (t) => `<span style="color:var(--purple);font-weight:700">${t}</span>`;

  // 持仓分类
  const holdingCodes  = new Set(holdings.map(x => x.code_c));
  const buyCodes      = new Set(buyCandidates.map(x => x.code_c));

  const _watchState = getWatchState();

  // 各触发类型（持仓标的中）
  const posOverLimit      = holdings.filter(x => x._posVal > 50);
  const ma20TriggeredCodes = new Set(
    _watchState.filter(w => w.status === 'triggered').map(w => w.code_c)
  );
  const urgentSell    = holdings.filter(x =>
    x._globalRank > 6 || posOverLimit.includes(x) || ma20TriggeredCodes.has(x.code_c));
  const watchSell     = sellBelowMa20.filter(x =>
    !urgentSell.includes(x));

  const toBuy         = buyCandidates.filter(x => !holdingCodes.has(x.code_c));

  // 生成每个持仓标的的具体操作金额说明（含颜色标注）
  function sellDetail(x) {
    const lines = [];
    if (x._globalRank > 6) {
      lines.push(`卖出全部 ${hiRed(fmtY(x._amt))}（排名跌至 #${x._globalRank}，超出前6）→ 转入货币基金`);
    } else if (x._posVal > 50) {
      const keepAmt  = totalAmt * 0.50;
      const sellAmt  = x._amt - keepAmt;
      lines.push(`卖出 ${hiRed(fmtY(sellAmt))}（仓位 ${x._posVal.toFixed(1)}% 超出50%，保留 ${hiGreen(fmtY(keepAmt))}）`);
    } else if (ma20TriggeredCodes.has(x.code_c)) {
      const ws = _watchState.find(w => w.code_c === x.code_c);
      const keepAmt = totalAmt * 0.15;
      const sellAmt = x._amt - keepAmt;
      lines.push(`连续${ws?.days_below_ma20 || 2}日跌破MA20 → 减仓至15%：卖出 ${hiRed(fmtY(sellAmt))}，保留 ${hiGreen(fmtY(keepAmt))}`);
    }
    return lines;
  }

  function watchDetail(x) {
    const ws = _watchState.find(w => w.code_c === x.code_c);
    const days = ws?.days_below_ma20 || 1;
    const floorAmt = totalAmt * 0.15;
    const sellAmt  = x._amt > floorAmt ? x._amt - floorAmt : x._amt;
    const note = x._amt > floorAmt
      ? `第${days}日跌破MA20（首次：${ws?.first_break_date||'–'}），再观察1日确认后减至15%：卖出 ${hiRed(fmtY(sellAmt))}，保留 ${hiGreen(fmtY(floorAmt))}`
      : `第${days}日跌破MA20（首次：${ws?.first_break_date||'–'}），当前仓位已低于15%，确认连续2日后清仓 ${hiRed(fmtY(x._amt))}`;
    return `${hiYellow('⏱ 待确认')} ${x.name}（${note}）`;
  }

  // 确定综合结论的 type
  let finalType, finalTitle, finalColor, finalBg, finalBorder, finalLines = [];

  const hasSell    = urgentSell.length > 0;
  const hasBuy     = buyCandidates.length > 0;
  const holdingMatch = holdings.length > 0
    && buyCandidates.length > 0
    && buyCandidates.every(x => holdingCodes.has(x.code_c))
    && holdings.length === buyCandidates.length
    && urgentSell.length === 0;

  if (!hasSell && holdingMatch) {
    finalType   = 'hold';
    finalTitle  = '维持现仓，无需操作';
    finalColor  = 'var(--cyan)';
    finalBg     = 'rgba(6,182,212,.06)';
    finalBorder = 'rgba(6,182,212,.25)';
    finalLines  = [`持仓标的 ${holdings.map(x=>`${hiGreen(x.name)} ${fmtY(x._amt)} (${x._posVal.toFixed(1)}%)`).join('、')} 仍满足所有买入条件，且无卖出信号`];
  } else if (hasSell && hasBuy) {
    finalType   = 'swap';
    finalTitle  = `换仓操作`;
    finalColor  = 'var(--yellow)';
    finalBg     = 'rgba(245,158,11,.06)';
    finalBorder = 'rgba(245,158,11,.3)';
    urgentSell.forEach((x, i) => sellDetail(x).forEach(l =>
      finalLines.push(`${['①','②','③'][i]||'→'} ${hiLaser(x.name)}：${l}`)));
    watchSell.forEach(x => finalLines.push(watchDetail(x)));
    buyCandidates.forEach((x, i) => {
      const buyAmt = totalAmt * 0.50;
      finalLines.push(`${['②','③','④'][i]||'→'} 买入 ${hiPurple(x.name)} · ${x.code_c}：${hiGreen(fmtY(buyAmt))}（目标仓位 50%）`);
    });
  } else if (hasSell && !hasBuy) {
    finalType   = 'sell';
    finalTitle  = `卖出，转货币基金`;
    finalColor  = 'var(--red)';
    finalBg     = 'rgba(239,68,68,.06)';
    finalBorder = 'rgba(239,68,68,.3)';
    urgentSell.forEach((x, i) => sellDetail(x).forEach(l =>
      finalLines.push(`${['①','②','③'][i]||'→'} ${hiLaser(x.name)}：${l}`)));
    watchSell.forEach(x => finalLines.push(watchDetail(x)));
    finalLines.push('当前无满足条件的买入标的，卖出资金转入货币基金等待');
  } else if (!hasSell && hasBuy && toBuy.length > 0) {
    finalType   = 'buy';
    finalTitle  = buyCandidates.length >= 2
      ? `买入 ${buyCandidates.map(x=>x.name).join(' + ')}`
      : `买入 ${buyCandidates[0].name}（单仓 50%）`;
    finalColor  = 'var(--green)';
    finalBg     = 'rgba(34,197,94,.06)';
    finalBorder = 'rgba(34,197,94,.3)';
    buyCandidates.forEach((x, i) => {
      const buyAmt = totalAmt > 0 ? totalAmt * 0.50 : 0;
      finalLines.push(`${['①','②'][i]||'→'} 买入 ${hiPurple(x.name)} · ${x.code_c}：${hiGreen(fmtY(buyAmt))}（目标仓位 50%）`);
    });
    if (buyCandidates.length === 1)
      finalLines.push('仅1只满足条件，余50%仓位转入货币基金');
  } else if (!hasSell && watchSell.length > 0) {
    finalType   = 'watch';
    finalTitle  = '持仓观察，关注MA20';
    finalColor  = 'var(--yellow)';
    finalBg     = 'rgba(245,158,11,.06)';
    finalBorder = 'rgba(245,158,11,.2)';
    watchSell.forEach(x => finalLines.push(watchDetail(x)));
  } else {
    finalType   = 'wait';
    finalTitle  = holdings.length > 0 ? '持仓等待，无操作信号' : '空仓等待';
    finalColor  = 'var(--text-dim)';
    finalBg     = 'rgba(255,255,255,.03)';
    finalBorder = 'rgba(255,255,255,.1)';
    finalLines  = [holdings.length > 0
      ? '持仓标的无卖出信号，当前买入候选未满足全部条件，继续持有等待下次复盘'
      : '当前无满足买入条件的标的，保持空仓，资金转入货币基金'];
  }

  // ── 构建结构化操作行（卖出 / 买入 / 关注）────────────────
  const sellRows = [];
  const buyRows  = [];

  urgentSell.forEach(x => {
    if (x._globalRank > 6) {
      sellRows.push({ from: x.name, amt: x._amt, watch: false,
        to: '货币基金', note: `排名跌至 #${x._globalRank}，超出前6名` });
    } else if (x._posVal > 50) {
      const keepAmt = totalAmt * 0.50;
      sellRows.push({ from: x.name, amt: x._amt - keepAmt, watch: false,
        to: '货币基金', note: `仓位 ${x._posVal.toFixed(1)}% 超出50%，保留 ${fmtY(keepAmt)}` });
    } else if (ma20TriggeredCodes.has(x.code_c)) {
      const ws = _watchState.find(w => w.code_c === x.code_c);
      const keepAmt = totalAmt * 0.15;
      sellRows.push({ from: x.name, amt: x._amt - keepAmt, watch: false,
        to: '货币基金',
        note: `连续${ws?.days_below_ma20 || 2}日跌破MA20，减仓至15%，保留 ${fmtY(keepAmt)}` });
    }
  });
  watchSell.forEach(x => {
    const ws = _watchState.find(w => w.code_c === x.code_c);
    const days = ws?.days_below_ma20 || 1;
    const floorAmt = totalAmt * 0.15;
    const sellAmt  = x._amt > floorAmt ? x._amt - floorAmt : x._amt;
    const noteStr  = x._amt > floorAmt
      ? `第${days}日跌破MA20（首次：${ws?.first_break_date||'–'}），再观察1日确认后减至15%，保留 ${fmtY(floorAmt)}`
      : `第${days}日跌破MA20，确认连续2日后清仓`;
    sellRows.push({ from: x.name, amt: sellAmt, watch: true, to: '货币基金', note: noteStr });
  });
  buyCandidates.forEach(x => {
    buyRows.push({ from: '货币基金', amt: totalAmt * 0.50, to: x.name,
      toCode: x.code_c, note: `目标仓位 50%` });
  });

  // ── 渲染操作表格 ─────────────────────────────────────────
  const th = (t) => `<th style="padding:7px 10px;text-align:left;font-size:12px;font-weight:600;color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap">${t}</th>`;
  const td = (t, extra='') => `<td style="padding:7px 10px;font-size:13px;vertical-align:top;border-bottom:1px solid rgba(255,255,255,.04);${extra}">${t}</td>`;

  function opTable(rows, type) {
    if (rows.length === 0) {
      const emptyMsg = type === 'sell' ? '无卖出操作' : '无买入操作';
      return `<div style="color:var(--text-dim);font-size:13px;padding:14px 0">${emptyMsg}</div>`;
    }
    const theadClr = type === 'sell' ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)';
    const titleClr = type === 'sell' ? 'var(--red)' : 'var(--green)';
    const title    = type === 'sell' ? '🔴 卖出' : '🟢 买入';
    const rowsHtml = rows.map((r, i) => {
      const amtClr = r.watch ? 'var(--yellow)' : (type === 'sell' ? 'var(--red)' : 'var(--green)');
      const amtStr = `<span style="color:${amtClr};font-weight:700">${fmtY(r.amt)}</span>`;
      const fromStr = r.from === '货币基金'
        ? `<span style="color:var(--text-dim)">${r.from}</span>`
        : `<span style="color:#ff4d4d;font-weight:700;text-shadow:0 0 6px rgba(255,77,77,.6)">${r.from}</span>`;
      const toStr = r.to === '货币基金'
        ? `<span style="color:var(--text-dim)">${r.to}</span>`
        : `<span style="color:var(--purple);font-weight:700">${r.to}</span>${r.toCode ? `<br><span style="color:var(--text-dim);font-size:11px">${r.toCode}</span>` : ''}`;
      const watchBadge = r.watch
        ? `<span style="background:rgba(245,158,11,.18);color:var(--yellow);font-size:11px;font-weight:700;padding:1px 5px;border-radius:3px;margin-right:4px">⚠ 待确认</span>`
        : '';
      return `<tr>${td(fromStr)}${td(amtStr)}${td(toStr)}${td(watchBadge + `<span style="color:var(--text-dim);font-size:12px">${r.note}</span>`)}<td id="mdtfr-row-action-${type}-${i}" style="padding:6px 8px;vertical-align:middle;border-bottom:1px solid rgba(255,255,255,.04);white-space:nowrap"><button class="btn-row-confirm" onclick="confirmTradeRow('${type}',${i})" title="确认执行此行">✅ 确认</button></td></tr>`;
    }).join('');
    return `<div style="font-size:13px;font-weight:700;color:${titleClr};margin-bottom:6px">${title}</div>
      <table style="width:100%;border-collapse:collapse;background:${theadClr};border-radius:8px;overflow:hidden">
        <thead><tr>${th('原标的')}${th('金额')}${th('现标的')}${th('说明')}${th('')}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
  }

  const hasAnyOp = sellRows.length > 0 || buyRows.length > 0;
  const tablesHtml = hasAnyOp
    ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px">
        <div>${opTable(sellRows,'sell')}</div>
        <div>${opTable(buyRows,'buy')}</div>
      </div>`
    : `<div style="color:var(--text-dim);font-size:13px;margin-top:8px">${finalLines[0] || ''}</div>`;

  const finalHtml = `
    <div style="background:${finalBg};border:1px solid ${finalBorder};border-radius:10px;padding:16px 18px;margin-top:4px">
      <div style="font-size:20px;font-weight:800;color:${finalColor};line-height:1.4;margin-bottom:4px">${finalTitle}</div>
      ${tablesHtml}
      ${holdings.length > 0 ? `<div style="font-size:12px;color:var(--text-dim);margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)">当前持仓：${holdings.map(x=>`${x.name} ${fmtY(x._amt)} (${x._posVal.toFixed(1)}%)`).join('、')}　总金额：${fmtY(totalAmt)}</div>` : ''}
    </div>`;

  // ── 2. 选股规则 ───────────────────────────────────────────
  const modeSummary = isAttack
    ? `→ <b style="color:var(--red)">进攻模式</b>（任一满足即可）`
    : `→ <b style="color:var(--blue)">防守模式</b>（两条均不满足）`;
  const modeHtml = `
    ${condRow(cond1, modeCond1Text, modeCond1Note)}
    ${condRow(cond2, modeCond2Text, modeCond2Note)}
    <div style="padding:6px 0 6px 26px;font-size:13px">${modeSummary}</div>`;

  const poolText = isAttack
    ? `进攻模式：12只标的全部纳入候选，正常执行动量轮动选股`
    : `防守模式：仅可从沪深300、中证500、红利低波动、黄金（4只）中选择买入`;
  const poolNote = `候选池 ${pool.length} 只` + (isAttack ? '' : `（防御标的）`) +
    `，动量最高：${ranked[0]?.name||'–'} ${fmtRet(ranked[0]?.ret_20d)}`;
  const stockRulesHtml = modeHtml + condRow(null, poolText, poolNote);

  // ── 3. 买入条件（只分析前2，标的名称前打✓✗）──────────────
  const buyDetailHtml = top2.map(x => {
    const pass = x._allPass;
    const nameIcon = pass ? '✓' : '✗';
    const nameClr  = pass ? 'var(--green)' : 'var(--red)';
    const border   = pass ? 'rgba(34,197,94,.3)'   : 'rgba(255,255,255,.1)';
    const bg       = pass ? 'rgba(34,197,94,.06)'  : 'rgba(255,255,255,.03)';
    return `<div style="margin:8px 0;padding:10px 14px;border-radius:8px;background:${bg};border:1px solid ${border}">
      <div style="font-size:14px;font-weight:700;margin-bottom:6px">
        <span style="color:${nameClr};margin-right:6px">${nameIcon}</span>
        <span style="color:var(--text)">${escHtml(x.name)}</span>
        <span style="color:var(--text-dim);font-weight:400;font-size:12px;margin-left:8px">${x.code_c} · 候选池排名 #${x._poolRank}</span>
      </div>
      ${condRow(x._c1, '过去20个交易日涨跌幅排名前2', `排名 #${x._poolRank}`)}
      ${condRow(x._c2, '过去20个交易日涨幅 ≥ 3%（绝对动量门槛，过滤弱势标的）',
        `近20日 <span style="color:${rclr(x.ret_20d)}">${fmtRet(x.ret_20d)}</span>`)}
      ${condRow(x._c3, '收盘价站上20日均线',
        `收盘 ${x.latest_close?.toFixed(3)} ${x._c3?'>':'≤'} MA20 ${x.ma20?.toFixed(3)}`)}
      ${condRow(x._c4, '60日均线向上（中长期趋势向好，避免逆势买入）',
        `${x.ma60_trend||'N/A'}${x.ma60_rate!=null?' '+(x.ma60_rate>0?'+':'')+x.ma60_rate.toFixed(2)+'%':''}`)}
    </div>`;
  }).join('');

  const opBoxHtml = buyCandidates.length >= 2
    ? `<div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:6px;padding:9px 14px;font-size:13px;margin-top:6px">✓ 满足2只 — 等金额买入，各仓位约 <b>50%</b></div>`
    : buyCandidates.length === 1
    ? `<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:6px;padding:9px 14px;font-size:13px;margin-top:6px">△ 满足1只 — 买入该只，仓位 <b>50%</b>，剩余转货币基金</div>`
    : `<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:9px 14px;font-size:13px;color:var(--text-dim);margin-top:6px">✗ 满足0只 — 保持空仓，等待下次复盘</div>`;

  // ── 4. 卖出条件（按持仓标的逐条判断）────────────────────
  let sellHtml;
  if (holdings.length === 0) {
    sellHtml = `<div style="color:var(--text-dim);font-size:13px;padding:10px 0">暂无持仓记录，请在表格「金额(元)」列中输入持仓金额</div>`;
  } else {
    const sellCondRow = (triggered, warnText, safeText, note, type = 'normal') => {
      let icon, iclr, tclr;
      if (type === 'watch') {
        icon = '⏱'; iclr = 'var(--yellow)'; tclr = 'var(--yellow)';
      } else if (type === 'triggered') {
        icon = '✓'; iclr = 'var(--red)'; tclr = 'var(--text)';
      } else {
        icon = triggered === true ? '✓' : triggered === false ? '✗' : '○';
        iclr = triggered === true ? 'var(--green)' : 'var(--text-dim)';
        tclr = triggered === true ? 'var(--text)' : 'var(--text-dim)';
      }
      const text = (type === 'watch' || triggered === true) ? warnText : safeText;
      return `<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);align-items:flex-start">
        <span style="color:${iclr};font-size:14px;flex-shrink:0;width:16px;margin-top:1px">${icon}</span>
        <div style="flex:1;min-width:0">
          <span style="color:${tclr};font-size:13px">${text}</span>
          ${note ? `<span style="color:var(--text-dim);font-size:12px;margin-left:6px">— ${note}</span>` : ''}
        </div>
      </div>`;
    };

    sellHtml = holdings.map(x => {
      const rankTriggered = x._globalRank > 6;
      const posTriggered  = x._posVal > 50;
      const lossTriggered = null;

      const ws = _watchState.find(w => w.code_c === x.code_c);
      const ma20Below     = x.above_ma20 === false;
      const ma20Watching  = ma20Below && ws?.status === 'watching';
      const ma20IsTriggered = ma20Below && ws?.status === 'triggered';
      const watchDays     = ws?.days_below_ma20 || 1;

      const rankNote = rankTriggered
        ? `当前全局排名 #${x._globalRank}，已跌出前6 → 建议立即卖出`
        : `当前全局排名 #${x._globalRank}，仍在前6`;
      const posNote = posTriggered
        ? `当前仓位 ${x._posVal.toFixed(1)}%，超出50% → 立即卖出超额部分`
        : `当前仓位 ${x._posVal.toFixed(1)}%，未超过50%`;

      let ma20Type, ma20WarnText, ma20SafeText, ma20Note;
      if (ma20IsTriggered) {
        ma20Type     = 'triggered';
        ma20WarnText = `趋势破位：已连续 ${watchDays} 日跌破MA20 → 立即减仓至15%，保留 ${fmtY(totalAmt * 0.15)}`;
        ma20Note     = `首次跌破：${ws?.first_break_date}，最新收盘 ${x.latest_close?.toFixed(3)} ≤ MA20 ${x.ma20?.toFixed(3)}`;
      } else if (ma20Watching) {
        ma20Type     = 'watch';
        ma20WarnText = `趋势破位：第${watchDays}日跌破MA20（首次：${ws?.first_break_date}）→ 再观察1日，确认连续2日后减仓至15%`;
        ma20Note     = `收盘 ${x.latest_close?.toFixed(3)} ≤ MA20 ${x.ma20?.toFixed(3)}`;
      } else if (ma20Below) {
        ma20Type     = 'watch';
        ma20WarnText = `趋势破位：第1日跌破MA20 → 再观察1日，确认连续2日后减仓至15%`;
        ma20Note     = `收盘 ${x.latest_close?.toFixed(3)} ≤ MA20 ${x.ma20?.toFixed(3)}`;
      } else {
        ma20Type     = 'normal';
        ma20WarnText = '';
        ma20SafeText = `趋势完好：收盘价站上20日均线，暂无破位信号`;
        ma20Note     = `收盘 ${x.latest_close?.toFixed(3)} > MA20 ${x.ma20?.toFixed(3)}`;
      }

      const anyTriggered = rankTriggered || ma20Below || posTriggered;
      const border = anyTriggered ? 'rgba(34,197,94,.3)'  : 'rgba(255,255,255,.08)';
      const bg     = anyTriggered ? 'rgba(34,197,94,.06)' : 'rgba(255,255,255,.02)';
      const nameClr = anyTriggered ? 'var(--green)' : 'var(--text-dim)';
      const nameIcon = anyTriggered ? '✓' : '✗';

      return `<div style="margin:8px 0;padding:10px 14px;border-radius:8px;background:${bg};border:1px solid ${border}">
        <div style="font-size:14px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px">
          <span style="color:${nameClr}">${nameIcon}</span>
          <span style="color:var(--text)">${escHtml(x.name)}</span>
          <span style="color:var(--text-dim);font-size:12px;font-weight:400">${x.code_c}</span>
          ${ma20IsTriggered ? `<span style="font-size:11px;padding:1px 6px;border-radius:3px;background:rgba(239,68,68,.15);color:var(--red);font-weight:700">🔔 连续${watchDays}日跌破MA20</span>` : ma20Watching ? `<span style="font-size:11px;padding:1px 6px;border-radius:3px;background:rgba(245,158,11,.15);color:var(--yellow);font-weight:700">⏱ 观察第${watchDays}日</span>` : ''}
          <span style="font-size:12px;color:var(--yellow);font-weight:600;margin-left:auto">¥${x._amt.toLocaleString()} · ${x._posVal.toFixed(1)}%</span>
        </div>
        ${sellCondRow(rankTriggered,
          '排名过滤：近20日涨幅排名跌出前6名 → 立即卖出该ETF，找到替代标的则换仓，否则转货币基金',
          '排名过滤：近20日涨幅排名仍在前6名内，无需操作',
          rankNote)}
        ${sellCondRow(ma20IsTriggered, ma20WarnText, ma20SafeText || '', ma20Note, ma20Type)}
        ${sellCondRow(posTriggered,
          '仓位控制：仓位已超过50% → 立即卖出超额部分，补入另一只或转货币基金',
          '仓位控制：仓位未超过50%，无需操作',
          posNote)}
        ${sellCondRow(lossTriggered,
          '止损强制减仓：持仓亏损超过10% → 强制减仓50%，无论其他条件是否触发',
          '止损强制减仓：持仓亏损未超过10%，无需操作',
          '需人工对比买入成本价确认是否亏损超10%')}
      </div>`;
    }).join('');
  }

  // ── 组装 ────────────────────────────────────────────────
  const mod = (icon, title, content) => `
    <div style="margin-top:20px">
      <div style="font-size:13px;font-weight:700;color:var(--cyan);margin-bottom:4px;display:flex;align-items:center;gap:6px">
        <span>${icon}</span><span>${title}</span>
      </div>${content}
    </div>`;

  body.innerHTML = `
    <div style="padding:20px 20px 16px;border-bottom:1px solid var(--border)">
      <div style="margin-bottom:12px">
        <span class="advice-mode-badge ${isAttack?'attack':'defend'}">${isAttack?'⚔ 进攻模式':'🛡 防守模式'}</span>
      </div>
      ${finalHtml}
    </div>
    <div style="padding:4px 20px 24px">
      ${mod('📋', '选股规则', stockRulesHtml)}
      ${mod('✅', '买入条件（四条须同时满足）', buyDetailHtml + opBoxHtml)}
      ${mod('⚠',  '卖出条件（任意触发立即执行）', sellHtml)}
    </div>`;

  card.style.display = '';

  // 将当前 advice 数据暴露供 journal.js 使用
  _lastAdviceData = {
    finalType, finalTitle,
    finalLines: finalLines.map(l => l.replace(/<[^>]+>/g, '')),
    sellRows: sellRows.map(r => ({ ...r, amtText: fmtY(r.amt) })),
    buyRows:  buyRows.map(r => ({ ...r, amtText: fmtY(r.amt) })),
    holdings: holdings.map(x => ({
      name: x.name, code_c: x.code_c, group: x.group,
      amt: x._amt, pos_pct: parseFloat(x._posVal.toFixed(1)),
      latest_close: x.latest_close, ret_20d: x.ret_20d,
      above_ma20: x.above_ma20, ma60_trend: x.ma60_trend,
      global_rank: x._globalRank,
    })),
    total_amt: totalAmt,
    is_attack: isAttack,
  };

  // 自动保存复盘（通过 main.js 注入的回调，避免循环依赖）
  if (_journalSaver) _journalSaver(true);
}
