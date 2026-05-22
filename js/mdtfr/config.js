// MDTFR 标的池配置模块
// 所有标的平等对待，全部参与动量监控与买卖分析

const MDTFR_POOL_DEF = [
  // 宽基（5 只）
  {name:"沪深300",   code_c:"006131", code_a:"460300", etf:"510300", group:"宽基"},
  {name:"中证500",   code_c:"006382", code_a:"001052", etf:"512500", group:"宽基"},
  {name:"创业板",    code_c:"004744", code_a:"110026", etf:"159915", group:"宽基"},
  {name:"中证1000",  code_c:"011861", code_a:"011860", etf:"512100", group:"宽基"},
  {name:"科创50",    code_c:"011609", code_a:"011608", etf:"588080", group:"宽基"},
  // 行业（16 只）
  {name:"半导体",    code_c:"007301", code_a:"007300", etf:"512480", group:"行业"},
  {name:"医药卫生",  code_c:"007077", code_a:"007076", etf:"159929", group:"行业"},
  {name:"证券公司",  code_c:"012363", code_a:"012362", etf:"512880", group:"行业"},
  {name:"人工智能",  code_c:"008021", code_a:"008020", etf:"515980", group:"行业"},
  {name:"主要消费",  code_c:"012857", code_a:"000248", etf:"159928", group:"行业"},
  {name:"红利低波动",code_c:"007467", code_a:"007466", etf:"512890", group:"行业"},
  {name:"有色金属",  code_c:"004433", code_a:"004432", etf:"512400", group:"行业"},
  {name:"畜牧养殖",  code_c:"012725", code_a:"012724", etf:"159865", group:"行业"},
  {name:"军工",      code_c:"005693", code_a:"003017", etf:"512680", group:"行业"},
  {name:"煤炭",      code_c:"008280", code_a:"008279", etf:"515220", group:"行业"},
  {name:"中药",      code_c:"501012", code_a:"501011", etf:"560080", group:"行业"},
  {name:"恒生科技",  code_c:"013128", code_a:"013127", etf:"513260", group:"行业"},
  {name:"恒生生物",  code_c:"016971", code_a:"016970", etf:"159892", group:"行业"},
  {name:"光伏产业",  code_c:"021085", code_a:"021084", etf:"159863", group:"行业"},
  {name:"机器人",    code_c:"014881", code_a:"014880", etf:"159770", group:"行业"},
  {name:"新能源",    code_c:"012832", code_a:"012831", etf:"516160", group:"行业"},
  // 防御（1 只）
  {name:"黄金",      code_c:"000217", code_a:"000216", etf:"518880", group:"防御"},
];

export function getMdtfrPoolDef() { return [...MDTFR_POOL_DEF]; }
