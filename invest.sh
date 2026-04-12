#!/bin/bash

# ==============================================================================
# invest.sh — Investment App 统一管理脚本
# ==============================================================================
# 用法 / Usage:
#   ./invest.sh [命令] [选项]
#
# 命令 / Commands:
#   start         启动服务（前台，默认）
#   install       安装依赖
#   kill          释放占用端口
#   commit        提交所有变更（以当前时间为 commit message，不 push）
#   service       管理 macOS 后台自启动服务（子命令见下）
#   help          显示帮助
#
# service 子命令:
#   service install     安装并启动开机自启动服务
#   service uninstall   停止并卸载服务
#   service restart     重启服务（升级后使用）
#   service status      查看服务运行状态
#   service logs        实时查看服务日志
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
        --*) warn "未知参数: $1" ;;
        *) break ;;  # 非选项参数（如子命令 install/restart），停止解析留给主流程
    esac
    shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"

# launchd 相关常量
SERVICE_LABEL="com.investment.server"
PLIST_PATH="$HOME/Library/LaunchAgents/${SERVICE_LABEL}.plist"
LOG_DIR="$HOME/.investment/logs"

# ==============================================================================
# 帮助信息
# ==============================================================================
show_help() {
    echo -e "${BOLD}invest.sh${NC} — Investment App 管理脚本\n"
    echo -e "${BOLD}用法:${NC}"
    echo "  ./invest.sh [命令] [选项]"
    echo ""
    echo -e "${BOLD}命令:${NC}"
    printf "  %-24s %s\n" "start"             "启动服务（前台，默认）"
    printf "  %-24s %s\n" "install"           "安装所有依赖"
    printf "  %-24s %s\n" "kill"              "释放占用的端口（默认 9001）"
    printf "  %-24s %s\n" "commit"            "提交所有变更（以当前时间为 commit message，不 push）"
    printf "  %-24s %s\n" "service install"   "安装并启动开机自启动服务（launchd）"
    printf "  %-24s %s\n" "service uninstall" "停止并卸载开机自启动服务"
    printf "  %-24s %s\n" "service restart"   "重启后台服务（代码更新后使用）"
    printf "  %-24s %s\n" "service status"    "查看后台服务运行状态"
    printf "  %-24s %s\n" "service logs"      "实时查看后台服务日志（Ctrl+C 退出）"
    printf "  %-24s %s\n" "help"              "显示此帮助"
    echo ""
    echo -e "${BOLD}选项:${NC}"
    printf "  %-24s %s\n" "--skip-install"    "跳过依赖安装步骤"
    printf "  %-24s %s\n" "--port PORT"       "服务端口（默认 9001）"
    echo ""
    echo -e "${BOLD}示例:${NC}"
    echo "  ./invest.sh                          # 前台启动服务"
    echo "  ./invest.sh service install          # 安装开机自启动"
    echo "  ./invest.sh service restart          # 升级代码后重启"
    echo "  ./invest.sh service logs             # 查看实时日志"
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
# 启动服务（前台）
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
# launchd 服务管理
# ==============================================================================

# 生成 plist 文件内容
_generate_plist() {
    local uvicorn_bin="$VENV_DIR/bin/uvicorn"
    mkdir -p "$LOG_DIR"
    cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${SERVICE_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${uvicorn_bin}</string>
        <string>main:app</string>
        <string>--port</string>
        <string>${PORT}</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${SCRIPT_DIR}</string>

    <!-- 登录后立即启动 -->
    <key>RunAtLoad</key>
    <true/>

    <!-- 崩溃后自动重启 -->
    <key>KeepAlive</key>
    <true/>

    <!-- 日志输出 -->
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/server.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/server.error.log</string>

    <!-- 环境变量（确保 PATH 包含 Homebrew）-->
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
EOF
}

service_install() {
    step "安装开机自启动服务"

    if [ ! -f "$VENV_DIR/bin/uvicorn" ]; then
        error "未找到 uvicorn，请先运行 ./invest.sh install 安装依赖。"
        exit 1
    fi

    # 若已加载，先卸载
    if launchctl list "$SERVICE_LABEL" &>/dev/null 2>&1; then
        warn "服务已存在，先卸载旧版本..."
        launchctl unload "$PLIST_PATH" 2>/dev/null || true
    fi

    mkdir -p "$HOME/Library/LaunchAgents"
    _generate_plist
    success "plist 已写入: $PLIST_PATH"

    launchctl load "$PLIST_PATH"
    sleep 1

    if launchctl list "$SERVICE_LABEL" &>/dev/null 2>&1; then
        success "服务已启动并设为开机自启动"
        info "  日志目录 : $LOG_DIR"
        info "  访问地址 : http://localhost:$PORT"
        info "  查看日志 : ./invest.sh service logs"
        info "  停止服务 : ./invest.sh service uninstall"
    else
        error "服务启动失败，请检查日志：$LOG_DIR/server.error.log"
        exit 1
    fi
}

service_uninstall() {
    step "卸载开机自启动服务"

    if [ ! -f "$PLIST_PATH" ]; then
        warn "未找到 plist 文件，服务可能未安装。"
        return 0
    fi

    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
    success "服务已停止并移除"
}

service_restart() {
    step "重启后台服务"

    if [ ! -f "$PLIST_PATH" ]; then
        error "服务未安装，请先运行 ./invest.sh service install"
        exit 1
    fi

    # 重新生成 plist（端口等参数可能更新）
    _generate_plist

    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    sleep 1
    launchctl load "$PLIST_PATH"
    sleep 1

    if launchctl list "$SERVICE_LABEL" &>/dev/null 2>&1; then
        success "服务已重启"
        info "  访问地址 : http://localhost:$PORT"
    else
        error "重启失败，请检查：$LOG_DIR/server.error.log"
        exit 1
    fi
}

service_status() {
    step "服务状态"

    if ! launchctl list "$SERVICE_LABEL" &>/dev/null 2>&1; then
        warn "服务未运行（或未安装）"
        return 0
    fi

    local pid
    pid=$(launchctl list "$SERVICE_LABEL" 2>/dev/null | awk 'NR==2{print $1}')
    if [ "$pid" != "-" ] && [ -n "$pid" ]; then
        success "服务运行中  PID: $pid"
    else
        warn "服务已注册但进程未运行"
    fi

    info "  plist    : $PLIST_PATH"
    info "  日志     : $LOG_DIR/server.log"
    info "  错误日志 : $LOG_DIR/server.error.log"
    info "  访问地址 : http://localhost:$PORT"
}

service_logs() {
    if [ ! -f "$LOG_DIR/server.log" ] && [ ! -f "$LOG_DIR/server.error.log" ]; then
        warn "暂无日志文件，服务可能未启动。"
        return 0
    fi
    info "实时日志（Ctrl+C 退出）..."
    tail -F "$LOG_DIR/server.log" "$LOG_DIR/server.error.log" 2>/dev/null
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

    service)
        SUB="${1:-}"
        shift || true
        case "$SUB" in
            install)   service_install ;;
            uninstall) service_uninstall ;;
            restart)   service_restart ;;
            status)    service_status ;;
            logs)      service_logs ;;
            *)
                error "未知 service 子命令: $SUB"
                echo "可用子命令: install | uninstall | restart | status | logs"
                exit 1
                ;;
        esac
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
        --*) warn "未知参数: $1" ;;
        *) break ;;  # 非选项参数（如子命令 install/restart），停止解析留给主流程
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
