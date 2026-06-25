# Charming UI — AI Coding Assistant

[中文文档](README.zh-CN.md)

A modern, web-based visual interface for AI-powered coding. Provides a rich GUI with real-time streaming, tool call visualization, multi-provider support, session management, integrated terminal, and more.

## Architecture

```
Browser (React + Vite + Tailwind CSS)
    │
    ├── REST (sessions, files, settings, projects, MCP, providers)
    │
    └── WebSocket (chat streaming, permissions, tool calls, terminal I/O)
            │
    Node.js Backend (Express + ws)
            │
    ┌───────┴────────┐
    │                │
Claude Agent SDK    OpenAI-compatible APIs
(Anthropic)         (DeepSeek, OpenAI, OpenRouter, Azure, etc.)
```

## Quick Start

### Prerequisites
- Node.js 18+
- An API key for at least one provider (Anthropic, DeepSeek, OpenAI, etc.)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Set environment variables
cp .env.example .env
# Edit .env to set ANTHROPIC_API_KEY, PORT, etc.
# Provider API keys can also be configured in the web UI Settings

# 3. Start development servers
npm run dev
```

The backend runs on **http://localhost:3001** and the frontend on **http://localhost:5173**.

Open the frontend URL and configure your API keys in **Settings → Providers**. All settings persist to `~/.charming-ui/settings.json`.

### Docker (Local)

```bash
# Build and start
docker compose up -d

# With API key
ANTHROPIC_API_KEY=sk-ant-... docker compose up -d
```

Frontend at **http://localhost:80**, backend at **http://localhost:3001**.

### Deploy to Server

```bash
# 1. Clone the project on your server
git clone <repo-url> charming-ui && cd charming-ui

# 2. Create production config
cp .env.production.example .env.production
# Edit .env.production:
#   - Set ANTHROPIC_API_KEY
#   - Set DOMAIN=charming.yourdomain.com
#   - Set DATA_DIR=/opt/charming-data (persistent storage)

# 3. Start services
docker compose --env-file .env.production up -d

# 4. Check status
docker compose ps
docker compose logs -f
```

#### With HTTPS (Caddy)

Add to `docker-compose.yml` or create `docker-compose.prod.yml`:

```yaml
services:
  caddy:
    image: caddy:alpine
    container_name: charming-caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
    restart: unless-stopped
```

`Caddyfile`:
```
charming.yourdomain.com {
    reverse_proxy frontend:80
}
```

Then `docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d`.

Caddy auto-provisions Let's Encrypt SSL certificates — zero configuration needed.

## Features

### Chat & Streaming
- **Real-time streaming** — Responses appear token by token with animated cursor
- **Markdown rendering** — Tables, blockquotes, task lists, LaTeX math (KaTeX)
- **Code syntax highlighting** — Powered by Shiki (VS Code engine), 28+ languages, dark/light theme aware
- **Thinking visualization** — Collapsible reasoning blocks for Claude's extended thinking
- **Message editing** — Edit any sent message and regenerate the response
- **Conversation forking** — Fork from any message to explore alternative directions

### Tools & Permissions
- **Tool call cards** — Expandable cards showing commands, file operations, searches with timing
- **Permission dialogs** — Approve or deny Claude's tool use requests in a modal UI
- **Auto-approve configuration** — Set which tools skip permission checks (e.g. Read, Glob)

### Providers & Models
- **Multi-provider** — Anthropic (Claude SDK) + OpenAI-compatible APIs (DeepSeek, OpenAI, OpenRouter, Azure, etc.)
- **Model selector** — Switch providers/models with `Ctrl+/` from the input bar
- **Provider management** — Add/edit/delete providers, configure API keys, custom base URLs
- **Model discovery** — Auto-fetch available models from provider APIs
- **Balance query** — Check DeepSeek/OpenAI account balance from settings
- **Custom provider defaults** — New providers start blank — no OpenAI defaults forced

### Context & Cost Control
- **Context compression** — Auto-summarize older messages when approaching context limit
- **Configurable thresholds** — Set context window size, trigger percentage, and messages to preserve
- **Token monitoring** — Per-turn and session-level token usage + cost tracking in the header
- **Spending limits** — Per-query USD cap — Claude stops automatically when reached
- **System prompt** — Custom instructions appended to Claude's default system prompt

### Session & Project Management
- **Persistent sessions** — Survive restarts, stored as JSON files
- **Session search** — Full-text search across all sessions (messages, thinking, tool calls)
- **Project management** — Multi-project with directory scanning (detects git, package.json, CLAUDE.md)
- **Export** — Download conversations as Markdown or JSON with full detail

### UI & UX
- **Dark/Light/System theme** — Three-mode theme toggle
- **i18n** — English + Chinese (zh-CN) with full UI coverage
- **Command palette** — `Ctrl+K` fuzzy-search for all actions
- **Keyboard shortcuts** — `Ctrl+N` new chat, `Ctrl+Shift+C` copy reply, `Ctrl+/` model switch, `Ctrl+,` settings
- **Resizable panels** — File explorer (right) and terminal (bottom) with drag-to-resize

### MCP (Model Context Protocol)
- **Server configuration** — Add/edit/delete MCP servers in Settings (stdio, HTTP, SSE, WebSocket)
- **Extensible tools** — Connect MCP servers to give Claude additional capabilities

### Integrated Terminal
- **xterm.js PTY** — Full terminal emulator in the bottom panel
- **Shell selector** — PowerShell, CMD, Git Bash, WSL, bash, zsh
- **Conda support** — Auto-detect and select conda environments

### File Explorer
- **Tree view** — Lazy-loaded recursive directory browser
- **File preview** — Read file contents with syntax highlighting (max 200 lines)

## Project Structure

```
packages/
  shared/      # Shared TypeScript types (frontend ↔ backend)
  backend/     # Express + WebSocket server, SDK wrappers
  frontend/    # React + Vite + Tailwind CSS SPA
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand |
| UI Components | Radix UI, react-markdown, Shiki, KaTeX, Lucide Icons, xterm.js |
| Backend | Node.js, Express, ws, node-pty |
| AI SDK | @anthropic-ai/claude-agent-sdk (Anthropic), native fetch (OpenAI-compatible) |
| Storage | JSON files in `~/.charming-ui/` (sessions, projects, settings) |

## Configuration

### Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Fallback Anthropic API key |
| `PORT` | `3001` | Backend server port |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin |
| `CHARMING_HOME` | `~/.charming-ui` | Data directory |
| `LOG_LEVEL` | `info` | Pino log level |

Provider API keys (DeepSeek, OpenAI, OpenRouter, etc.) are configured in the **web UI Settings**, not in `.env`. They persist to `~/.charming-ui/settings.json`.

## License

MIT
