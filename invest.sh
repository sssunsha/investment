#!/bin/bash

# ==============================================================================
# invest.sh — Investment App 统一管理脚本
# ==============================================================================
# 用法 / Usage:
#   ./invest.sh [命令] [选项]
#
# 命令 / Commands:
#   start         启动服务（默认）
#   install       安装依赖
#   kill          释放占用端口
#   commit        提交所有变更（以当前时间为 commit message，不 push）
#   help          显示帮助
#
# 选项 / Options:
#   --skip-install  跳过依赖安装
#   --port PORT     服务端口（默认 9001）
# ==============================================================================

set -euo pipefail

# --- 颜色定义 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERR]${NC}  $1"; }
step()    { echo -e "\n${BOLD}${CYAN}▶ $1${NC}"; }

# --- 默认参数 ---
COMMAND="${1:-start}"
SKIP_INSTALL=false
PORT=9001

# --- 解析参数 ---
shift || true
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-install) SKIP_INSTALL=true ;;
        --port) PORT="$2"; shift ;;
        *) warn "未知参数: $1" ;;
    esac
    shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"

# ==============================================================================
# 帮助信息
# ==============================================================================
show_help() {
    echo -e "${BOLD}invest.sh${NC} — Investment App 管理脚本\n"
    echo -e "${BOLD}用法:${NC}"
    echo "  ./invest.sh [命令] [选项]"
    echo ""
    echo -e "${BOLD}命令:${NC}"
    printf "  %-20s %s\n" "start"           "启动服务（默认）"
    printf "  %-20s %s\n" "install"         "安装所有依赖"
    printf "  %-20s %s\n" "kill"            "释放占用的端口（默认 9001）"
    printf "  %-20s %s\n" "commit"          "提交所有变更（以当前时间为 commit message，不 push）"
    printf "  %-20s %s\n" "help"            "显示此帮助"
    echo ""
    echo -e "${BOLD}选项:${NC}"
    printf "  %-20s %s\n" "--skip-install"  "跳过依赖安装步骤"
    printf "  %-20s %s\n" "--port PORT"     "服务端口（默认 9001）"
    echo ""
    echo -e "${BOLD}示例:${NC}"
    echo "  ./invest.sh                      # 启动服务"
    echo "  ./invest.sh start --skip-install # 跳过依赖检查直接启动"
    echo "  ./invest.sh start --port 8080    # 指定端口启动"
    echo "  ./invest.sh install              # 安装依赖"
    echo "  ./invest.sh commit               # 仅本地提交（message: 2026-04-08 14:30:00）"
}

# ==============================================================================
# 工具检查
# ==============================================================================
check_tools() {
    step "检查必要工具"
    if ! command -v python3 &>/dev/null; then
        error "未找到 python3，请先安装。"
        exit 1
    fi
    success "工具检查通过"
}

# ==============================================================================
# 查找合适的 Python（带 SSL 支持）
# ==============================================================================
find_python() {
    for candidate in /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3 python3; do
        if command -v "$candidate" &>/dev/null && "$candidate" -c "import ssl" &>/dev/null; then
            PYTHON_BIN="$candidate"
            info "使用 Python: $PYTHON_BIN ($($PYTHON_BIN --version))"
            return 0
        fi
    done
    error "未找到支持 SSL 的 Python。请通过 Homebrew 安装：brew install python@3.12"
    exit 1
}

# ==============================================================================
# 依赖安装
# ==============================================================================
setup() {
    step "配置环境"
    find_python

    # 如果已有 venv 但 SSL 损坏，重建
    if [ -d "$VENV_DIR" ]; then
        if ! "$VENV_DIR/bin/python" -c "import ssl" &>/dev/null; then
            warn "已有 venv SSL 支持损坏，正在重建..."
            rm -rf "$VENV_DIR"
        fi
    fi

    if [ ! -d "$VENV_DIR" ]; then
        info "创建 Python 虚拟环境: $VENV_DIR"
        "$PYTHON_BIN" -m venv "$VENV_DIR"
        success "虚拟环境已创建"
    fi

    source "$VENV_DIR/bin/activate"
    info "安装依赖..."
    pip install --retries 5 -r "$SCRIPT_DIR/requirements.txt"
    success "依赖已就绪"
}

# ==============================================================================
# 端口管理：释放占用指定端口的进程
# ==============================================================================
kill_port() {
    local port="$1"
    local pids
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        warn "端口 $port 被占用 (PID: $pids)，正在释放..."
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
        success "端口 $port 已释放"
    else
        info "端口 $port 未被占用"
    fi
}

# ==============================================================================
# 清理后台进程
# ==============================================================================
APP_PID=""
cleanup() {
    echo ""
    info "正在清理后台进程..."
    if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
        kill "$APP_PID"
        success "进程 (PID: $APP_PID) 已停止"
    fi
    command -v deactivate &>/dev/null && deactivate 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# ==============================================================================
# 启动服务
# ==============================================================================
start_app() {
    step "启动服务 (端口 $PORT)"
    kill_port "$PORT"
    source "$VENV_DIR/bin/activate"
    (cd "$SCRIPT_DIR" && uvicorn main:app --reload --port "$PORT") &
    APP_PID=$!
    sleep 2
    success "服务已启动 (PID: $APP_PID)"
    info "  Swagger UI : http://localhost:$PORT/docs"
    info "  ReDoc      : http://localhost:$PORT/redoc"
}

# ==============================================================================
# Git 提交
# ==============================================================================
git_commit() {
    step "Git 提交"

    if ! command -v git &>/dev/null; then
        error "未找到 git，请先安装。"
        exit 1
    fi

    cd "$SCRIPT_DIR"

    if ! git rev-parse --is-inside-work-tree &>/dev/null; then
        error "当前目录不在 Git 仓库中。"
        exit 1
    fi

    if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
        warn "没有检测到任何变更，无需提交。"
        return 0
    fi

    local COMMIT_MSG
    COMMIT_MSG="$(date '+%Y-%m-%d %H:%M:%S')"

    info "暂存所有变更..."
    git add -A

    info "创建提交: $COMMIT_MSG"
    git commit -m "$COMMIT_MSG"
}

# ==============================================================================
# 主流程
# ==============================================================================
case "$COMMAND" in
    start)
        check_tools
        if ! $SKIP_INSTALL; then
            setup
        else
            source "$VENV_DIR/bin/activate"
        fi
        start_app
        info "按 Ctrl+C 退出。"
        wait "$APP_PID"
        cleanup
        ;;

    install)
        check_tools
        setup
        success "所有依赖安装完毕"
        ;;

    kill)
        step "释放端口"
        kill_port "$PORT"
        success "端口清理完成"
        ;;

    commit)
        git_commit
        ;;

    help|--help|-h)
        show_help
        ;;

    *)
        error "未知命令: $COMMAND"
        echo ""
        show_help
        exit 1
        ;;
esac
