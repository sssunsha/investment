# 投资助手 Investment Assistant

一个基于 BaoStock 数据源的个人投资分析工具，采用前后端分离架构，支持 Web、桌面（Electron）和移动端（Android / Cordova）多平台运行。

---

## 项目结构

```
investment/
├── backend/                  # Python FastAPI 后端
│   ├── main.py               # 应用入口，注册所有路由
│   ├── requirements.txt      # Python 依赖
│   └── routers/              # 按 BaoStock 文档分类的路由模块
│       ├── history.py        # 历史行情数据
│       ├── sector.py         # 板块与指数成分股
│       ├── evaluation.py     # 季频财务指标
│       ├── corpreport.py     # 公司业绩报告
│       ├── metadata.py       # 证券基础数据
│       └── macroscopic.py    # 宏观经济数据
├── frontend/                 # Angular 前端
│   ├── src/app/
│   │   ├── pages/            # 页面：dashboard / market / analysis / portfolio / settings
│   │   ├── services/         # API 服务层
│   │   └── components/       # 共享组件
│   ├── electron.js           # Electron 主进程
│   └── cordova-app/          # Cordova / Android 工程
└── invest.sh                 # 一键管理脚本
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.12 · FastAPI · BaoStock · Pandas · Uvicorn |
| 前端 | Angular 21 · TypeScript |
| 桌面端 | Electron 41 |
| 移动端 | Cordova / Android |
| API 文档 | Swagger UI（FastAPI 自动生成）|

---

## 功能特性

- **行情看板**：主要指数（上证、深证、沪深300、创业板、科创50）实时快照
- **ETF 轮动策略**：基于20日收益率排名 + MA20/MA60 趋势过滤，自动输出买入信号
- **BaoStock 全量 API 封装**：结构与官方文档目录完全对应，共 25 个 RESTful 端点

### 后端 API 分类

| 分类 | 路径前缀 | 主要接口 |
|------|----------|---------|
| 历史行情 | `/api/security/history` | K线数据（日/周/月/分钟） |
| 板块成分 | `/api/security/sector` | 行业分类、沪深300、上证50、中证500成分股 |
| 季频财务 | `/api/evaluation` | 盈利/营运/成长/偿债/现金流/杜邦/分红/复权因子 |
| 业绩报告 | `/api/corpreport` | 业绩快报、业绩预告 |
| 基础数据 | `/api/metadata` | 交易日历、全量证券列表、证券基本资料 |
| 宏观经济 | `/api/macroscopic` | 存贷款利率、存款准备金率、货币供应量 |
| 自定义策略 | `/api` | 指数快照、ETF 轮动策略 |

---

## 环境要求

| 工具 | 最低版本 | 说明 |
|------|----------|------|
| Python | 3.12 | 需带 SSL 支持（推荐 Homebrew 安装） |
| Node.js | 18+ | 前端构建 |
| npm | 9+ | 前端包管理 |
| Git | 任意 | 版本管理 |

---

## 快速开始

### 方式一：使用一键脚本（推荐）

```bash
# 克隆项目
git clone <repo-url>
cd investment

# 首次运行：自动安装依赖并启动前后端
./invest.sh

# 跳过依赖安装直接启动（非首次）
./invest.sh dev --skip-install
```

启动后访问：
- 前端：`http://localhost:9000`
- 后端 Swagger UI：`http://localhost:9001/docs`
- 后端 ReDoc：`http://localhost:9001/redoc`

### 方式二：手动分步启动

**1. 后端**

```bash
cd backend

# 创建虚拟环境（首次）
python3 -m venv venv
source venv/bin/activate

# 安装依赖（首次）
pip install -r requirements.txt

# 启动
uvicorn main:app --reload --port 9001
```

**2. 前端**

```bash
cd frontend

# 安装依赖（首次）
npm install

# 启动开发服务器
npm start -- --port 9000
```

---

## 其他运行模式

### 仅启动后端

```bash
./invest.sh backend
```

### 仅启动前端

```bash
./invest.sh frontend
```

### 指定端口

```bash
./invest.sh dev --port-be 8000 --port-fe 4200
```

---

## 构建与打包

### 生产构建（Web）

```bash
./invest.sh build
# 输出目录：frontend/dist
```

### 桌面应用（Electron）

```bash
./invest.sh build:electron
# 输出目录：frontend/release
```

### Android 包

```bash
./invest.sh build:android
# 需要已安装 Android SDK 和 Cordova
```

---

## 依赖安装

```bash
# 一次性安装前后端所有依赖
./invest.sh install
```

---

## invest.sh 完整命令参考

| 命令 | 说明 |
|------|------|
| `./invest.sh` | 启动前后端（默认 `dev`） |
| `./invest.sh dev` | 启动前后端 |
| `./invest.sh backend` | 仅启动后端 |
| `./invest.sh frontend` | 仅启动前端 |
| `./invest.sh build` | 前端生产构建 |
| `./invest.sh build:electron` | 打包 Electron 桌面版 |
| `./invest.sh build:android` | 编译 Android debug 包 |
| `./invest.sh install` | 安装所有依赖 |
| `./invest.sh commit` | 本地 git 提交（message 为当前时间） |
| `./invest.sh help` | 显示帮助 |

**选项：**

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--skip-install` | — | 跳过依赖安装 |
| `--port-be PORT` | `9001` | 后端端口 |
| `--port-fe PORT` | `9000` | 前端端口 |

---

## 数据来源

本项目使用 [BaoStock](http://baostock.com) 提供的免费股票数据，覆盖沪深 A 股、指数、ETF，历史数据从 2006 年起。使用前请阅读 BaoStock 数据使用协议。
