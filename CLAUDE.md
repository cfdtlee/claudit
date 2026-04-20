# Claudit Development Rules

## iOS Changes — MANDATORY Verification

Before telling the user any iOS code change is complete, you MUST:

1. Verify the file compiles — at minimum check for structural errors (mismatched braces, missing types)
2. Run `cd ios && xcodegen generate` if new files were added
3. Run `npm run build --prefix server` if server TypeScript was changed
4. Never guess Swift API signatures — always verify from the dependency source code first
5. Check for duplicate braces, missing closing braces, and code accidentally placed outside the struct

If you cannot verify compilation, explicitly tell the user "I haven't been able to verify this compiles" instead of saying it's done.

## Server Changes

After modifying server TypeScript, always run `npm run build --prefix server` to verify before reporting completion.

## Commit Rules

- Do NOT add `Co-Authored-By: Claude` to commit messages
- After code changes, always rebuild and restart the dev server: `npm run build && npm run dev`

## Port

- Server default port: 7433
- Vite dev proxy: localhost:7433
- Relay: wss://claudit-relay.fly.dev

## Architecture

- Monorepo: `server/` (Express + better-sqlite3), `client/` (React + Vite), `shared/` (types), `ios/` (SwiftUI), `relay/` (Fly.io WebSocket relay)
- iOS uses Starscream for WebSocket (not URLSessionWebSocketTask — it has HTTP/2 multiplexing bugs)
- iOS uses SwiftTerm for terminal rendering
- Relay pairing credentials persisted at `~/.claudit/relay.json`
