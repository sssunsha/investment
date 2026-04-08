#!/bin/bash

# ==============================================================================
# invest.sh — Investment App 统一管理脚本
# ==============================================================================
# 用法 / Usage:
#   ./invest.sh [命令] [选项]
#
# 命令 / Commands:
#   dev           启动前后端开发服务（默认）
#   backend       仅启动后端服务
#   frontend      仅启动前端服务
#   build         编译前端（生产构建）
#   build:electron 编译 Electron 桌面版
#   build:android 编译 Android 包（debug）
#   install       安装前后端依赖
#   help          显示帮助
#
# 选项 / Options:
#   --skip-install  跳过依赖安装
#   --port-be PORT  后端端口（默认 9001）
#   --port-fe PORT  前端端口（默认 9000）
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
COMMAND="${1:-dev}"
SKIP_INSTALL=false
PORT_BE=9001
PORT_FE=9000

# --- 解析参数 ---
shift || true
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-install) SKIP_INSTALL=true ;;
        --port-be) PORT_BE="$2"; shift ;;
        --port-fe) PORT_FE="$2"; shift ;;
        *) warn "未知参数: $1" ;;
    esac
    shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"

# ==============================================================================
# 帮助信息
# ==============================================================================
show_help() {
    echo -e "${BOLD}invest.sh${NC} — Investment App 管理脚本\n"
    echo -e "${BOLD}用法:${NC}"
    echo "  ./invest.sh [命令] [选项]"
    echo ""
    echo -e "${BOLD}命令:${NC}"
    printf "  %-20s %s\n" "dev"             "启动前后端开发服务（默认）"
    printf "  %-20s %s\n" "backend"         "仅启动后端服务"
    printf "  %-20s %s\n" "frontend"        "仅启动前端服务"
    printf "  %-20s %s\n" "build"           "编译前端（生产构建）"
    printf "  %-20s %s\n" "build:electron"  "打包 Electron 桌面应用"
    printf "  %-20s %s\n" "build:android"   "编译 Android 包（debug）"
    printf "  %-20s %s\n" "install"         "安装前后端所有依赖"
    printf "  %-20s %s\n" "kill"            "释放前后端占用的端口（默认 9001/9000）"
    printf "  %-20s %s\n" "commit"          "提交所有变更（以当前时间为 commit message，不 push）"
    printf "  %-20s %s\n" "help"            "显示此帮助"
    echo ""
    echo -e "${BOLD}选项:${NC}"
    printf "  %-20s %s\n" "--skip-install"  "跳过依赖安装步骤"
    printf "  %-20s %s\n" "--port-be PORT"  "后端端口（默认 9001）"
    printf "  %-20s %s\n" "--port-fe PORT"  "前端端口（默认 9000）"
    echo ""
    echo -e "${BOLD}示例:${NC}"
    echo "  ./invest.sh                      # 启动前后端"
    echo "  ./invest.sh dev --skip-install   # 跳过依赖检查直接启动"
    echo "  ./invest.sh backend              # 仅启动后端"
    echo "  ./invest.sh frontend --port-fe 4200"
    echo "  ./invest.sh build                # 生产构建前端"
    echo "  ./invest.sh build:electron       # 打包桌面版
  ./invest.sh commit               # 仅本地提交（message: 2026-04-08 14:30:00）"
}

# ==============================================================================
# 工具检查
# ==============================================================================
check_tools() {
    step "检查必要工具"
    local missing=false
    for tool in python3 npm; do
        if ! command -v "$tool" &>/dev/null; then
            error "未找到 $tool，请先安装。"
            missing=true
        fi
    done
    $missing && exit 1
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
# 后端依赖安装
# ==============================================================================
setup_backend() {
    step "配置后端环境"
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
    info "安装后端依赖..."
    pip install --resume-retries 20 -r "$BACKEND_DIR/requirements.txt"
    success "后端依赖已就绪"
}

# ==============================================================================
# 前端依赖安装
# ==============================================================================
setup_frontend() {
    step "配置前端环境"
    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        info "安装前端依赖..."
        (cd "$FRONTEND_DIR" && npm install)
        success "前端依赖已安装"
    else
        info "前端依赖已存在，跳过安装"
    fi
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
BACKEND_PID=""
cleanup() {
    echo ""
    info "正在清理后台进程..."
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID"
        success "后端进程 (PID: $BACKEND_PID) 已停止"
    fi
    command -v deactivate &>/dev/null && deactivate 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# ==============================================================================
# 启动后端
# ==============================================================================
start_backend() {
    step "启动后端服务 (端口 $PORT_BE)"
    kill_port "$PORT_BE"
    source "$VENV_DIR/bin/activate"
    (cd "$BACKEND_DIR" && uvicorn main:app --reload --port "$PORT_BE") &
    BACKEND_PID=$!
    sleep 2
    success "后端已启动 (PID: $BACKEND_PID)"
    info "  Swagger UI : http://localhost:$PORT_BE/docs"
    info "  ReDoc      : http://localhost:$PORT_BE/redoc"
}

# ==============================================================================
# 启动前端
# ==============================================================================
start_frontend() {
    step "启动前端服务 (端口 $PORT_FE)"
    kill_port "$PORT_FE"
    (cd "$FRONTEND_DIR" && npm start -- --port "$PORT_FE")
}

# ==============================================================================
# 编译前端
# ==============================================================================
build_frontend() {
    step "编译前端（生产构建）"
    (cd "$FRONTEND_DIR" && npm run build)
    success "前端编译完成，输出目录: frontend/dist"
}

# ==============================================================================
# 编译 Electron
# ==============================================================================
build_electron() {
    step "打包 Electron 桌面应用"
    (cd "$FRONTEND_DIR" && npm run electron:pack)
    success "Electron 打包完成，输出目录: frontend/release"
}

# ==============================================================================
# 编译 Android
# ==============================================================================
build_android() {
    step "编译 Android 包（debug）"
    (cd "$FRONTEND_DIR" && npm run android:debug)
    success "Android 构建完成"
}

# ==============================================================================
# Git 提交并推送
# ==============================================================================
git_commit() {
    step "Git 提交并推送"

    if ! command -v git &>/dev/null; then
        error "未找到 git，请先安装。"
        exit 1
    fi

    cd "$SCRIPT_DIR"

    if ! git rev-parse --is-inside-work-tree &>/dev/null; then
        error "当前目录不在 Git 仓库中。"
        exit 1
    fi

    # 检查是否有变更（含未跟踪文件）
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
    dev)
        check_tools
        if ! $SKIP_INSTALL; then
            setup_backend
            setup_frontend
        else
            # 仍需激活 venv
            source "$VENV_DIR/bin/activate"
        fi
        start_backend
        start_frontend
        info "前端服务已停止，退出。"
        cleanup
        ;;

    backend)
        check_tools
        $SKIP_INSTALL || setup_backend
        start_backend
        info "后端运行中，按 Ctrl+C 退出。"
        wait "$BACKEND_PID"
        cleanup
        ;;

    frontend)
        check_tools
        $SKIP_INSTALL || setup_frontend
        start_frontend
        ;;

    build)
        check_tools
        $SKIP_INSTALL || setup_frontend
        build_frontend
        ;;

    build:electron)
        check_tools
        $SKIP_INSTALL || setup_frontend
        build_electron
        ;;

    build:android)
        check_tools
        $SKIP_INSTALL || setup_frontend
        build_android
        ;;

    install)
        check_tools
        setup_backend
        setup_frontend
        success "所有依赖安装完毕"
        ;;

    kill)
        step "释放端口"
        kill_port "$PORT_BE"
        kill_port "$PORT_FE"
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
