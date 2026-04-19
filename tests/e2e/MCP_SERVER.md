# MCP Playwright Server

Provides Claude with programmatic access to E2E test execution and debugging.

## Tools Available

### `run_all_tests`
Run all Playwright E2E tests.

**Options:**
- `headed` (boolean, default: false) - Show browser during test execution
- `project` (string, default: "chromium") - Browser project to run

**Example:** Run all tests with browser visible
```json
{
  "headed": true
}
```

### `run_specific_test`
Run a single test file.

**Options:**
- `testFile` (required) - Test file to run: `auth.spec.ts`, `rooms.spec.ts`, `presence.spec.ts`, or `unread.spec.ts`
- `headed` (boolean, default: false) - Show browser

**Example:** Run auth tests
```json
{
  "testFile": "auth.spec.ts",
  "headed": false
}
```

### `get_test_results`
Fetch latest test results from the HTML report.

Returns:
- `passed` - Number of passed tests
- `failed` - Number of failed tests
- `skipped` - Number of skipped tests
- `reportPath` - Path to HTML report

### `debug_test`
Debug a specific test with Playwright Inspector.

**Options:**
- `testFile` (required) - Test file to debug

Returns interactive Playwright Inspector (requires terminal).

## Setup

The server is configured in `.mcp.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": ["tests/e2e/mcp-server.js"]
    }
  }
}
```

## Usage in Claude Code

Ask Claude to run tests programmatically:

- *"Run all E2E tests"* → calls `run_all_tests`
- *"Run auth tests and show results"* → calls `run_specific_test` + `get_test_results`
- *"Debug the presence test"* → calls `debug_test`

## Implementation

The server implements the Model Context Protocol (MCP) v2024-04-01 over stdio:
- JSON-RPC 2.0 requests/responses
- Tool definitions with JSON Schema input validation
- Async command execution for test runs

See `mcp-server.js` for implementation details.
