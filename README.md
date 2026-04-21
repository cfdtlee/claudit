```
   ██████╗██╗      █████╗ ██╗   ██╗██████╗ ██╗████████╗
  ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██║╚══██╔══╝
  ██║     ██║     ███████║██║   ██║██║  ██║██║   ██║
  ██║     ██║     ██╔══██║██║   ██║██║  ██║██║   ██║
  ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝██║   ██║
   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝   ╚═╝
```

The simplest Claude Code orchestrator — manage agents, sessions, tasks, and cron jobs from a clean web UI.

## Install

```bash
npm install -g claudit
```

The MCP server is automatically registered with Claude Code during installation.

**Prerequisites:**
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Node.js 18+
- C++ build tools for native modules:
  - macOS: `xcode-select --install`
  - Linux: `sudo apt install build-essential python3`

## Usage

```bash
claudit          # Start the dashboard
claudit --help   # Show help and MCP setup info
claudit -v       # Show version
```

Open http://localhost:7433

| Environment Variable | Description |
|---|---|
| `PORT` | Server port (default: 7433) |
| `NODE_ENV` | Set to `development` for dev mode |

## Features

- **Session Management** — View, search, archive, and batch-delete Claude Code sessions. Multi-select with Cmd/Ctrl+Click and Shift+Click.
- **Cron Tasks** — Schedule recurring Claude Code tasks with cron expressions.
- **Todos** — Create, organize, and track todos with groups and priorities.
- **MCP Integration** — Let Claude Code manage your todos directly via the built-in MCP server.

## MCP Server

Claudit ships a built-in MCP server (`claudit-mcp`) that lets Claude Code manage your todos directly. It is automatically registered during `npm install -g claudit`.

### Manual Setup

If auto-registration didn't work (e.g. Claude Code wasn't installed yet):

```bash
claude mcp add claudit claudit-mcp
```

Or edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "claudit": {
      "command": "claudit-mcp"
    }
  }
}
```

After setup, restart Claude Code. You can then ask Claude to "list my todos", "create a high-priority todo", etc.

### Available Tools

| Tool | Description |
|------|-------------|
| `list_todos` | List todos, filter by status, priority, or group |
| `get_todo` | Get full details of a todo by ID |
| `create_todo` | Create a todo with title, description, priority, and group |
| `update_todo` | Update fields, mark complete, or move between groups |
| `delete_todo` | Permanently delete a todo by ID |

## Data Storage

All data is stored in a SQLite database at `~/.claudit/claudit.db` (WAL mode for concurrent access).

## Notes

- Resuming a session that is already in use by another Claude Code instance will hang — pick an inactive session
- Slash commands (`/mcp`, `/help`, etc.) are interactive-mode-only and not supported in pipe mode
