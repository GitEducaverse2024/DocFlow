#!/usr/bin/env node
// MCP stdio-to-HTTP bridge for DoCatFlow CatBrains
// Usage: node mcp-bridge.mjs <catbrain-mcp-url>
// Example: node mcp-bridge.mjs http://192.168.1.49:3500/api/mcp/20dacde5-bdf7-497f-85f1-5a2ad13eb063

const MCP_URL = process.argv[2];
if (!MCP_URL) {
  process.stderr.write('Usage: node mcp-bridge.mjs <catbrain-mcp-url>\n');
  process.exit(1);
}

process.stderr.write(`[mcp-bridge] Connecting to ${MCP_URL}\n`);

let buffer = '';

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;

  // Process complete JSON-RPC messages (newline-delimited)
  let newlineIdx;
  while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);

    if (!line) continue;

    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stderr.write(`[mcp-bridge] Invalid JSON: ${line.slice(0, 100)}\n`);
      continue;
    }

    handleMessage(msg);
  }
});

async function handleMessage(msg) {
  const { method, id } = msg;

  // Notifications (no id) that we handle locally
  if (!id && method === 'notifications/initialized') {
    // No response needed for notifications
    return;
  }

  try {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });

    const data = await res.json();
    // Write response to stdout (newline-delimited JSON)
    process.stdout.write(JSON.stringify(data) + '\n');
  } catch (err) {
    // Return JSON-RPC error
    if (id !== undefined) {
      const errorResponse = {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: `Bridge error: ${err.message}` },
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
    }
    process.stderr.write(`[mcp-bridge] Error: ${err.message}\n`);
  }
}

process.stdin.on('end', () => {
  process.stderr.write('[mcp-bridge] stdin closed, exiting\n');
  process.exit(0);
});
