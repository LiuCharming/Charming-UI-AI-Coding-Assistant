# Charming UI — AI 编程助手

现代化 Web 可视化 AI 编程界面。提供实时流式输出、工具调用可视化、多提供商支持、会话管理、集成终端等功能。

## 架构

```
浏览器 (React + Vite + Tailwind CSS)
    │
    ├── REST (会话、文件、设置、项目、MCP、提供商)
    │
    └── WebSocket (对话流、权限、工具调用、终端 I/O)
            │
    Node.js 后端 (Express + ws)
            │
    ┌───────┴────────┐
    │                │
Claude Agent SDK    兼容 OpenAI 的 API
(Anthropic)         (DeepSeek、OpenAI、OpenRouter、Azure 等)
```

## 快速开始

### 环境要求
- Node.js 18+
- 至少一个提供商的 API Key（Anthropic、DeepSeek、OpenAI 等）

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2.（可选）设置环境变量
cp .env.example .env
# 编辑 .env 填入 ANTHROPIC_API_KEY 等
# 其他提供商的 API Key 可在 Web 界面设置中配置

# 3. 启动开发服务器
npm run dev
```

后端运行在 **http://localhost:3001**，前端运行在 **http://localhost:5173**。

打开前端地址，在 **设置 → 提供商** 中配置 API Key。所有设置持久化到 `~/.charming-ui/settings.json`。

### Docker（本地）

```bash
# 构建并启动
docker compose up -d

# 带 API Key
ANTHROPIC_API_KEY=sk-ant-... docker compose up -d
```

前端 **http://localhost:80**，后端 **http://localhost:3001**。

### 部署到服务器

```bash
# 1. 在服务器上克隆项目
git clone <仓库地址> charming-ui && cd charming-ui

# 2. 创建生产配置
cp .env.production.example .env.production
# 编辑 .env.production：
#   - 填入 ANTHROPIC_API_KEY
#   - 填入 DOMAIN=charming.yourdomain.com
#   - 设置 DATA_DIR=/opt/charming-data（持久化存储路径）

# 3. 启动服务
docker compose --env-file .env.production up -d

# 4. 查看状态
docker compose ps
docker compose logs -f
```

#### 配置 HTTPS（Caddy 自动 SSL）

使用生产配置叠加文件：

```bash
# 先修改 Caddyfile 中的域名为你自己的
vim Caddyfile

# 启动（自动申请 Let's Encrypt 免费证书）
docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Caddy 会自动申请和续期 Let's Encrypt SSL 证书，无需任何手动配置。

## 功能

### 对话与流式输出
- **实时流式输出** — 逐 token 显示回复，带动画光标
- **Markdown 渲染** — 表格、引用、任务列表、LaTeX 数学公式（KaTeX）
- **代码语法高亮** — 基于 Shiki（VS Code 引擎），支持 28+ 种语言，跟随暗色/亮色主题
- **思考过程可视化** — 可折叠的推理过程展示（Claude 扩展思考）
- **消息编辑** — 编辑已发送的消息并重新生成回复
- **对话分叉** — 从任意消息处创建分支对话，探索不同方向

### 工具与权限
- **工具调用卡片** — 可展开的命令、文件操作、搜索等卡片，显示执行时间
- **权限弹窗** — 模态框形式批准或拒绝 Claude 的工具调用请求
- **自动批准配置** — 设置哪些工具跳过权限检查（如 Read、Glob）

### 提供商与模型
- **多提供商** — Anthropic（Claude SDK）+ 兼容 OpenAI 的 API（DeepSeek、OpenAI、OpenRouter、Azure 等）
- **模型选择器** — `Ctrl+/` 从输入栏快速切换提供商和模型
- **提供商管理** — 添加/编辑/删除提供商，配置 API Key 和自定义 Base URL
- **模型发现** — 从提供商 API 自动获取可用模型列表
- **余额查询** — 在设置中查询 DeepSeek/OpenAI 账户余额
- **自定义提供商** — 添加时默认为空白，不强加 OpenAI 默认值

### 上下文与费用控制
- **上下文压缩** — 接近上下文限制时自动总结较早的消息
- **可配置阈值** — 自定义上下文窗口大小、触发百分比、保留消息数
- **Token 监控** — 实时显示每轮和会话级别的 Token 用量及费用
- **费用限额** — 单次查询 USD 上限，到达后自动停止
- **系统提示词** — 自定义追加到 Claude 默认系统提示词后的指令

### 会话与项目管理
- **持久化会话** — 重启不丢失，JSON 文件存储
- **全文搜索** — 跨所有会话搜索消息内容、思考过程、工具调用
- **项目管理** — 多项目支持，自动扫描目录（检测 git、package.json、CLAUDE.md）
- **导出对话** — 下载为 Markdown 或 JSON，包含完整对话细节

### 界面与体验
- **暗色/亮色/系统主题** — 三种模式切换
- **国际化** — 英文 + 中文（zh-CN）完整覆盖
- **命令面板** — `Ctrl+K` 模糊搜索执行所有操作
- **键盘快捷键** — `Ctrl+N` 新建对话、`Ctrl+Shift+C` 复制回复、`Ctrl+/` 切换模型、`Ctrl+,` 设置
- **可调面板** — 文件浏览器（右侧）和终端（底部）可拖拽调整大小

### MCP（模型上下文协议）
- **服务器配置** — 在设置中添加/编辑/删除 MCP 服务器（stdio、HTTP、SSE、WebSocket）
- **可扩展工具** — 连接 MCP 服务器为 Claude 扩展工具能力

### 集成终端
- **xterm.js PTY** — 底部面板完整的终端模拟器
- **Shell 选择** — PowerShell、CMD、Git Bash、WSL、bash、zsh
- **Conda 支持** — 自动检测并选择 conda 环境

### 文件浏览器
- **树形视图** — 懒加载递归目录浏览
- **文件预览** — 读取文件内容并语法高亮（最多 200 行）

## 项目结构

```
packages/
  shared/      # 前后端共享 TypeScript 类型定义
  backend/     # Express + WebSocket 服务器，SDK 封装
  frontend/    # React + Vite + Tailwind CSS 单页应用
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18、TypeScript、Vite、Tailwind CSS、Zustand |
| UI 组件 | Radix UI、react-markdown、Shiki、KaTeX、Lucide Icons、xterm.js |
| 后端 | Node.js、Express、ws、node-pty |
| AI SDK | @anthropic-ai/claude-agent-sdk（Anthropic 管道）、原生 fetch（OpenAI 兼容管道） |
| 存储 | JSON 文件存储于 `~/.charming-ui/`（会话、项目、设置） |

## 配置

### 环境变量（`.env`）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ANTHROPIC_API_KEY` | — | Anthropic API 密钥（备用） |
| `PORT` | `3001` | 后端端口 |
| `FRONTEND_URL` | `http://localhost:5173` | 前端地址（CORS） |
| `CHARMING_HOME` | `~/.charming-ui` | 数据存储目录 |
| `LOG_LEVEL` | `info` | 日志级别 |

DeepSeek、OpenAI、OpenRouter 等提供商的 API Key 在 **Web 界面设置** 中配置，不在 `.env` 中。这些配置持久化到 `~/.charming-ui/settings.json`。

## License

MIT
