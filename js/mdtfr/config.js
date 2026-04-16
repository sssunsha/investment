// MDTFR 标的池配置模块
// 定义进攻性候选标的、基础池及激活状态管理

const OFFENSIVE_CANDIDATES = [
  {name:"半导体",    code_c:"007301", code_a:"007300", etf:"512480", group:"行业", offensive:true, desc:"科技主线，流动性极佳，动量效应明显"},
  {name:"人工智能",  code_c:"008021", code_a:"008020", etf:"515980", group:"行业", offensive:true, desc:"AI热点赛道，动量弹性足，贴合科技成长主线"},
  {name:"光伏产业",  code_c:"021085", code_a:"021084", etf:"159863", group:"行业", offensive:true, desc:"光伏热点赛道，补充新能源赛道配置"},
  {name:"机器人",    code_c:"014881", code_a:"014880", etf:"159770", group:"行业", offensive:true, desc:"机器人赛道，贴合科技成长主线，可替换AI、半导体"},
  {name:"新能源",    code_c:"012832", code_a:"012831", etf:"516160", group:"行业", offensive:true, desc:"新能源全赛道，覆盖光伏、风电等，可替换防御类标的"},
];

// ── 固定基础池（宽基5 + 非进攻行业4 + 防御1 = 10只）────────────────
const MDTFR_POOL_BASE = [
  // 宽基（5 只）
  {name:"沪深300",   code_c:"006131", code_a:"460300", etf:"510300", group:"宽基",  offensive:false},
  {name:"中证500",   code_c:"006382", code_a:"001052", etf:"512500", group:"宽基",  offensive:false},
  {name:"创业板",    code_c:"004744", code_a:"110026", etf:"159915", group:"宽基",  offensive:true},
  {name:"中证1000",  code_c:"011861", code_a:"011860", etf:"512100", group:"宽基",  offensive:true},
  {name:"科创50",    code_c:"011609", code_a:"011608", etf:"588080", group:"宽基",  offensive:true},
  // 非进攻行业（4 只）
  {name:"医药卫生",  code_c:"007077", code_a:"007076", etf:"159929", group:"行业",  offensive:true},
  {name:"证券公司",  code_c:"012363", code_a:"012362", etf:"512880", group:"行业",  offensive:true},
  {name:"主要消费",  code_c:"012857", code_a:"000248", etf:"159928", group:"行业",  offensive:true},
  {name:"红利低波动",code_c:"007467", code_a:"007466", etf:"512890", group:"行业",  offensive:false},
  // 防御（1 只）
  {name:"黄金",      code_c:"000217", code_a:"000216", etf:"518880", group:"防御",  offensive:false},
];

// ── 激活进攻行业状态（默认：半导体 + 人工智能）──────────────────────
const _OFFENSIVE_KEY = 'mdtfr_offensive_codes';
function _loadActiveCodes() {
  try {
    const saved = JSON.parse(localStorage.getItem(_OFFENSIVE_KEY));
    if (Array.isArray(saved) && saved.length === 2 &&
        saved.every(c => OFFENSIVE_CANDIDATES.some(x => x.code_c === c))) {
      return new Set(saved);
    }
  } catch {}
  return new Set(['007301', '008021']); // 默认：半导体 + 人工智能
}
let _activeOffensiveCodes = _loadActiveCodes();

function _buildMdtfrPool() {
  const active = OFFENSIVE_CANDIDATES.filter(c => _activeOffensiveCodes.has(c.code_c));
  // 进攻行业插入宽基（5只）之后，医药之前
  return [
    ...MDTFR_POOL_BASE.slice(0, 5),  // 宽基
    ...active,                        // 进攻行业（2只，可变）
    ...MDTFR_POOL_BASE.slice(5),      // 非进攻行业 + 防御
  ];
}
let MDTFR_POOL_DEF = _buildMdtfrPool();

export { OFFENSIVE_CANDIDATES, MDTFR_POOL_BASE };

export function getActiveCodes() { return _activeOffensiveCodes; }
export function getMdtfrPoolDef() { return MDTFR_POOL_DEF; }
export function setActiveCodes(newSet) {
  _activeOffensiveCodes = newSet;
  localStorage.setItem(_OFFENSIVE_KEY, JSON.stringify([...newSet]));
}
export function rebuildPool() {
  MDTFR_POOL_DEF = _buildMdtfrPool();
  return MDTFR_POOL_DEF;
}
