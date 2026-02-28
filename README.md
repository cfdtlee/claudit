# Claudit

Web dashboard for managing and interacting with local Claude Code sessions, cron tasks, and todos.

## Install

```bash
npm install -g claudit
```

**Prerequisites:**
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Node.js 18+
- C++ build tools for native modules:
  - macOS: `xcode-select --install`
  - Linux: `sudo apt install build-essential python3`

## Usage

```bash
claudit
```

Open http://localhost:3001

## MCP Server (AI Tool Integration)

Claudit ships a built-in MCP server (`claudit-mcp`) that lets Claude Code or any MCP-compatible AI agent manage your todos directly.

### Available Tools

| Tool | Description |
|------|-------------|
| `list_todos` | List all todos, optionally filter by `status` (pending/completed) and `priority` |
| `get_todo` | Get full details of a todo by ID |
| `create_todo` | Create a new todo with title, description, priority |
| `update_todo` | Update title, description, completed status, or priority |
| `delete_todo` | Delete a todo by ID |

### Setup

**Option A: CLI (recommended)**

```bash
claude mcp add claudit-todos claudit-mcp
```

**Option B: Edit `~/.claude/settings.json` manually**

```json
{
  "mcpServers": {
    "claudit-todos": {
      "command": "claudit-mcp"
    }
  }
}
```

After setup, restart Claude Code. You can then ask Claude to "list my todos", "create a high-priority todo", etc.

### Data Storage

All data is stored in a SQLite database at `~/.claudit/claudit.db` (WAL mode for concurrent access).

## Notes

- Resuming a session that is already in use by another Claude Code instance will hang — pick an inactive session
- Slash commands (`/mcp`, `/help`, etc.) are interactive-mode-only and not supported in pipe mode
