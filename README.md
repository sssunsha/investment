# 投资助手 Investment Assistant

一个基于 BaoStock 数据源的个人投资分析工具，采用纯 Python FastAPI 后端架构，通过内置 HTML 页面提供 Web 界面，支持策略分析、再平衡计算、历史复盘等功能。

---

## 项目结构

```
investment/
├── main.py                     # 应用入口，注册所有路由
├── session.py                  # BaoStock 会话管理
├── requirements.txt            # Python 依赖
├── routers/                    # 路由模块
│   ├── history.py              # 历史行情数据
│   ├── sector.py               # 板块与指数成分股
│   ├── evaluation.py           # 季频财务指标
│   ├── corpreport.py           # 公司业绩报告
│   ├── metadata.py             # 证券基础数据
│   ├── macroscopic.py          # 宏观经济数据
│   ├── strategy.py             # 策略分析（全天候 / MDTFR）
│   ├── cache.py                # 本地 JSON 文件缓存接口
│   └── session.py              # BaoStock 会话接口
├── strategy/                   # 策略文档
│   ├── ray_dalio_all_weather.md            # 全天候配置动态平衡策略说明
│   └── momentum_trend_dual_filter_rotation.md  # 动量趋势双重过滤轮动策略说明
├── sdk/                        # BaoStock Python SDK（本地副本）
├── home_page.html              # 主页
├── strategy_page.html          # 策略分析页（全天候 + MDTFR）
├── settings_page.html          # 设置页
├── test_page.html              # 测试页
├── invest.sh                   # 一键管理脚本
└── README.md
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.12 · FastAPI · BaoStock · Pandas · Uvicorn |
| 前端 | 内置 HTML / CSS / JS（无框架） |
| 数据持久化 | 本地 JSON 文件（`~/.investment/`） |
| API 文档 | Swagger UI · ReDoc（FastAPI 自动生成）|

---

## 功能特性

### 策略分析页（`/strategy`）

#### 全天候配置动态平衡（`#aw`）

- 7 只场外基金，覆盖股票 / 长期债券 / 中期债券 / 黄金 / 大宗商品五大类别
- 输入各类别当前市值，自动计算再平衡操作（赎回 / 申购）
- 触发点检测：阈值再平衡（±4%）、极端情况（±8%）、股票内部比例、债券内部比例
- 调仓前后三列对比，生成"直接转换"与"卖出后再买入"两套方案
- **历史复盘**：每次计算完成后自动保存复盘记录，按年月存入 `~/.investment/YYYY/MM/aw_journal.json`，可通过弹窗按月查看历史记录

#### 动量趋势双重过滤轮动策略 MDTFR（`#mdtfr`）

- 12 只全赛道 ETF，覆盖宽基 / 行业 / 防御三大类别
- 市场模式判断（进攻 / 防守），动量排名 + MA20/MA60 双重过滤
- 持仓金额管理（持久化到 `~/.investment/mdtfr_amounts.json`）
- MA20 跌破连续观察（`~/.investment/mdtfr_watch.json`），连续 2 日触发减仓建议
- SSE 流式行情加载，每条数据到达即写入本地缓存
- **历史复盘**：数据加载完成后自动保存复盘记录，按年月存入 `~/.investment/YYYY/MM/mdtfr_journal.json`，可通过弹窗按月查看

### 本地缓存（`~/.investment/`）

```
~/.investment/
├── mdtfr_amounts.json          # MDTFR 持仓金额
├── mdtfr_watch.json            # MA20 跌破观察状态
└── YYYY/
    └── MM/
        ├── mdtfr_pool.json     # 当月每日标的池快照（按日期 key）
        ├── mdtfr_journal.json  # 当月 MDTFR 复盘记录
        └── aw_journal.json     # 当月 AW 再平衡复盘记录
```

### 后端 API

| 分类 | 路径前缀 | 主要接口 |
|------|----------|---------|
| 历史行情 | `/api/security/history` | K线数据（日/周/月/分钟，支持复权） |
| 板块成分 | `/api/security/sector` | 行业分类、沪深300、上证50、中证500成分股 |
| 季频财务 | `/api/evaluation` | 盈利/营运/成长/偿债/现金流/杜邦/分红/复权因子 |
| 业绩报告 | `/api/corpreport` | 业绩快报、业绩预告 |
| 基础数据 | `/api/metadata` | 交易日历、全量证券列表、证券基本资料 |
| 宏观经济 | `/api/macroscopic` | 存贷款利率、存款准备金率、货币供应量 |
| 策略分析 | `/api/strategy` | 全天候再平衡、MDTFR 标的池（批量 + SSE 流式） |
| 本地缓存 | `/api/cache` | 标的池快照 / MDTFR 复盘 / AW 复盘读写 |
| 会话管理 | `/api/session` | BaoStock 登录 / 登出 / 状态查询 |

---

## 环境要求

| 工具 | 最低版本 | 说明 |
|------|----------|------|
| Python | 3.12 | 需带 SSL 支持（推荐 Homebrew 安装） |
| Git | 任意 | 版本管理 |

---

## 快速开始

### 使用一键脚本（推荐）

```bash
# 首次运行：自动创建虚拟环境、安装依赖并启动服务
./invest.sh

# 跳过依赖安装直接启动（非首次）
./invest.sh start --skip-install

# 指定端口
./invest.sh start --port 8080
```

启动后访问：
- 主页：`http://localhost:9001`
- 策略分析：`http://localhost:9001/strategy`
- Swagger UI：`http://localhost:9001/docs`
- ReDoc：`http://localhost:9001/redoc`

### 手动启动

```bash
# 创建虚拟环境（首次）
python3 -m venv venv
source venv/bin/activate

# 安装依赖（首次）
pip install -r requirements.txt

# 启动
uvicorn main:app --reload --port 9001
```

---

## invest.sh 命令参考

| 命令 | 说明 |
|------|------|
| `./invest.sh` | 启动服务（默认 `start`） |
| `./invest.sh start` | 启动服务 |
| `./invest.sh install` | 安装所有依赖 |
| `./invest.sh kill` | 释放占用端口 |
| `./invest.sh commit` | 本地 git 提交（message 为当前时间） |
| `./invest.sh help` | 显示帮助 |

**选项：**

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--skip-install` | — | 跳过依赖安装 |
| `--port PORT` | `9001` | 服务端口 |

---

## 数据来源

本项目使用 [BaoStock](http://baostock.com) 提供的免费股票数据，覆盖沪深 A 股、指数、ETF，历史数据从 2006 年起。使用前请阅读 BaoStock 数据使用协议。
