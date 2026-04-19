#!/usr/bin/env node
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)
const __dirname = dirname(fileURLToPath(import.meta.url))

const tools = [
  {
    name: 'run_all_tests',
    description: 'Run all Playwright E2E tests',
    inputSchema: {
      type: 'object',
      properties: {
        headed: {
          type: 'boolean',
          description: 'Run tests in headed mode (show browser)',
          default: false,
        },
        project: {
          type: 'string',
          description: 'Specific project to run (chromium)',
          default: 'chromium',
        },
      },
    },
  },
  {
    name: 'run_specific_test',
    description: 'Run a specific test file',
    inputSchema: {
      type: 'object',
      properties: {
        testFile: {
          type: 'string',
          description: 'Test file to run (e.g., auth.spec.ts, rooms.spec.ts)',
          enum: ['auth.spec.ts', 'rooms.spec.ts', 'presence.spec.ts', 'unread.spec.ts'],
        },
        headed: {
          type: 'boolean',
          description: 'Run in headed mode',
          default: false,
        },
      },
      required: ['testFile'],
    },
  },
  {
    name: 'get_test_results',
    description: 'Get latest test results from HTML report',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'debug_test',
    description: 'Debug a specific test with --debug flag',
    inputSchema: {
      type: 'object',
      properties: {
        testFile: {
          type: 'string',
          description: 'Test file to debug',
          enum: ['auth.spec.ts', 'rooms.spec.ts', 'presence.spec.ts', 'unread.spec.ts'],
        },
      },
      required: ['testFile'],
    },
  },
]

async function runAllTests(args) {
  const cmd = `npx playwright test${args.headed ? ' --headed' : ''}${args.project ? ` --project=${args.project}` : ''}`
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: __dirname })
    return { success: true, output: stdout, error: stderr }
  } catch (err) {
    return { success: false, output: err.stdout || '', error: err.message }
  }
}

async function runSpecificTest(args) {
  const cmd = `npx playwright test ${args.testFile}${args.headed ? ' --headed' : ''}`
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: __dirname })
    return { success: true, output: stdout, error: stderr }
  } catch (err) {
    return { success: false, output: err.stdout || '', error: err.message }
  }
}

async function getTestResults() {
  const reportPath = resolve(__dirname, 'playwright-report/index.html')
  if (!existsSync(reportPath)) {
    return { success: false, message: 'No test report found. Run tests first.' }
  }
  try {
    const content = readFileSync(reportPath, 'utf-8')
    const passMatch = content.match(/(\d+)\s+passed/)
    const failMatch = content.match(/(\d+)\s+failed/)
    const skipMatch = content.match(/(\d+)\s+skipped/)
    return {
      success: true,
      passed: passMatch ? parseInt(passMatch[1]) : 0,
      failed: failMatch ? parseInt(failMatch[1]) : 0,
      skipped: skipMatch ? parseInt(skipMatch[1]) : 0,
      reportPath: reportPath,
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function debugTest(args) {
  const cmd = `npx playwright test ${args.testFile} --debug`
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: __dirname })
    return { success: true, output: stdout, error: stderr }
  } catch (err) {
    return {
      success: false,
      output: err.stdout || '',
      error: err.message,
      note: 'Debug mode requires interactive terminal',
    }
  }
}

async function processTool(toolName, toolInput) {
  switch (toolName) {
    case 'run_all_tests':
      return await runAllTests(toolInput)
    case 'run_specific_test':
      return await runSpecificTest(toolInput)
    case 'get_test_results':
      return await getTestResults()
    case 'debug_test':
      return await debugTest(toolInput)
    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

// MCP Protocol Handler
async function handleMessage(message) {
  if (message.jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' } }
  }

  if (message.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-04-01',
        capabilities: {},
        serverInfo: { name: 'playwright-mcp', version: '1.0.0' },
      },
    }
  }

  if (message.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: { tools },
    }
  }

  if (message.method === 'tools/call') {
    const result = await processTool(message.params.name, message.params.arguments)
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    }
  }

  return {
    jsonrpc: '2.0',
    id: message.id,
    error: { code: -32601, message: 'Method not found' },
  }
}

// Read stdin and process messages
let buffer = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', async (chunk) => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const message = JSON.parse(line)
      const response = await handleMessage(message)
      console.log(JSON.stringify(response))
    } catch (err) {
      console.error(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }))
    }
  }
})

process.stdin.on('end', () => {
  process.exit(0)
})
