#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// DoCatFlow Host Agent
// Runs on the HOST machine (not in Docker).
// Exposes endpoints for CatBot to execute commands, manage
// services, and access host files from inside the container.
// Protected by a Bearer token.
// ─────────────────────────────────────────────────────────────

import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = parseInt(process.env.HOST_AGENT_PORT || '3501', 10);
const TOKEN = process.env.HOST_AGENT_TOKEN || '';
const HOME = os.homedir();
const USER = os.userInfo().username;
const UID = os.userInfo().uid;

if (!TOKEN) {
  console.error('[host-agent] ERROR: HOST_AGENT_TOKEN not set. Run setup-host-agent.sh first.');
  process.exit(1);
}

// ─── Security ───

const BLOCKED_COMMANDS = [
  /\brm\s+(-[a-zA-Z]*)?-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\/\s*$/,
  /\brm\s+(-[a-zA-Z]*)?-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*\s+\/\s*$/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\binit\s+[06]\b/,
  /\bmkfs\b/,
  /\bdd\s+.*of=\/dev\//,
  /:()\{\s*:\|:&\s*\};:/,
  />\s*\/dev\/sd[a-z]/,
  /\bchmod\s+(-R\s+)?[0-7]*\s+\/\s*$/,
  /\bchown\s+(-R\s+)?.*\s+\/\s*$/,
];

function isBlocked(cmd) {
  return BLOCKED_COMMANDS.some(r => r.test(cmd));
}

const ALLOWED_DIRS = [
  `${HOME}/docflow/`,
  `${HOME}/.openclaw/`,
  `${HOME}/open-antigravity-workspace/`,
  `${HOME}/docflow-data/`,
  '/tmp/',
];

function isPathAllowed(p) {
  const resolved = path.resolve(p.replace(/^~/, HOME));
  return ALLOWED_DIRS.some(d => resolved.startsWith(d));
}

// ─── Service Registry ───

const SERVICES = [
  { name: 'docflow-app', type: 'docker', container: 'docflow-app', description: 'DoCatFlow Next.js app', port: 3500 },
  { name: 'docflow-qdrant', type: 'docker', container: 'docflow-qdrant', description: 'Qdrant vector database', port: 6333 },
  { name: 'docflow-ollama', type: 'docker', container: 'docflow-ollama', description: 'Ollama local LLM', port: 11434 },
  { name: 'antigravity-gateway', type: 'docker', container: 'antigravity-gateway', description: 'LiteLLM proxy', port: 4000 },
  { name: 'automation-n8n', type: 'docker', container: 'automation-n8n', description: 'n8n workflow automation', port: 5678 },
  { name: 'openclaw-gateway', type: 'systemd', unit: 'openclaw-gateway', description: 'OpenClaw agent gateway', port: 18789 },
  { name: 'openclaw-dashboard', type: 'systemd', unit: 'openclaw-dashboard', description: 'OpenClaw Mission Control' },
];

// ─── Helpers ───

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function respond(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function truncate(str, max = 10000) {
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n\n... [truncado, ${str.length} chars total]`;
}

// ─── Handlers ───

function handleExecute(body) {
  const command = String(body.command || '').trim();
  if (!command) return { error: 'Comando vacío' };
  if (isBlocked(command)) return { error: 'Comando bloqueado por seguridad' };

  try {
    const output = execSync(command, {
      timeout: 30_000,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      cwd: HOME,
      env: { ...process.env, HOME },
    });
    return { command, output: truncate(output), exit_code: 0 };
  } catch (err) {
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';
    const combined = (stdout + '\n' + stderr).trim();
    if (err.message?.includes('TIMEOUT')) {
      return { command, error: 'Timeout: excedió 30 segundos', output: truncate(combined) };
    }
    return { command, output: truncate(combined), exit_code: err.status || 1 };
  }
}

// Environment needed for systemctl --user to work from a systemd service
const SYSTEMD_USER_ENV = {
  ...process.env,
  HOME,
  XDG_RUNTIME_DIR: `/run/user/${UID}`,
  DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${UID}/bus`,
};

function fixOpenclawPerms() {
  try {
    execSync(`sudo chown -R ${USER}:${USER} ${HOME}/.openclaw/ && chmod 644 ${HOME}/.openclaw/openclaw.json`, {
      timeout: 5_000, encoding: 'utf-8',
    });
  } catch (err) {
    console.warn('[host-agent] Warning: failed to fix .openclaw perms:', err.message);
  }
}

function handleService(body) {
  const serviceName = String(body.service || '');
  const action = String(body.action || '');
  const logLines = Number(body.log_lines) || 50;

  const svc = SERVICES.find(s => s.name === serviceName);
  if (!svc) return { error: `Servicio desconocido: ${serviceName}. Disponibles: ${SERVICES.map(s => s.name).join(', ')}` };

  let command;
  let env = { ...process.env, HOME };

  if (svc.type === 'docker') {
    const cmds = {
      status: `docker inspect --format='{{.State.Status}} (uptime: {{.State.StartedAt}})' ${svc.container} 2>&1 || echo "Container not found"`,
      start: `docker start ${svc.container} 2>&1`,
      stop: `docker stop ${svc.container} 2>&1`,
      restart: `docker restart ${svc.container} 2>&1`,
      logs: `docker logs --tail ${logLines} ${svc.container} 2>&1`,
    };
    command = cmds[action];
  } else {
    // Fix openclaw permissions before any systemctl --user on openclaw services
    if (svc.unit.startsWith('openclaw')) {
      fixOpenclawPerms();
    }
    env = SYSTEMD_USER_ENV;
    const cmds = {
      status: `systemctl --user status ${svc.unit} 2>&1 || true`,
      start: `systemctl --user start ${svc.unit} 2>&1`,
      stop: `systemctl --user stop ${svc.unit} 2>&1`,
      restart: `systemctl --user restart ${svc.unit} 2>&1`,
      logs: `journalctl --user -u ${svc.unit} -n ${logLines} --no-pager 2>&1`,
    };
    command = cmds[action];
  }

  if (!command) return { error: `Acción no válida: ${action}` };

  try {
    const output = execSync(command, { timeout: 15_000, encoding: 'utf-8', maxBuffer: 512 * 1024, env });
    return { service: serviceName, type: svc.type, action, output: truncate(output.trim()), description: svc.description, port: svc.port };
  } catch (err) {
    return { service: serviceName, action, error: truncate(((err.stdout || '') + '\n' + (err.stderr || '')).trim()) };
  }
}

function handleFiles(body) {
  const action = String(body.action || '');
  const filePath = String(body.path || '');

  if (!filePath) return { error: 'Ruta no especificada' };

  const expanded = filePath.replace(/^~/, HOME);
  const resolved = path.resolve(expanded);

  if (!isPathAllowed(resolved)) {
    return { error: `Ruta no permitida: ${filePath}. Dirs seguros: ~/docflow/, ~/.openclaw/, ~/open-antigravity-workspace/, ~/docflow-data/, /tmp/` };
  }

  switch (action) {
    case 'read': {
      try {
        const stat = fs.statSync(resolved);
        if (stat.size > 50 * 1024) return { error: `Archivo demasiado grande (${(stat.size / 1024).toFixed(1)}KB). Límite: 50KB.` };
        const content = fs.readFileSync(resolved, 'utf-8');
        const ext = path.extname(resolved).slice(1);
        return { action: 'read', path: filePath, content, type: ext || 'text', size_bytes: stat.size };
      } catch { return { error: `No se puede leer: ${filePath}` }; }
    }
    case 'write': {
      const content = String(body.content || '');
      try {
        if (fs.existsSync(resolved)) fs.copyFileSync(resolved, resolved + '.bak');
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, content, 'utf-8');
        return { action: 'write', path: filePath, bytes_written: Buffer.byteLength(content), backup_created: fs.existsSync(resolved + '.bak') };
      } catch (e) { return { error: `No se puede escribir: ${e.message}` }; }
    }
    case 'list': {
      try {
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const items = entries.slice(0, 100).map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          size: e.isFile() ? fs.statSync(path.join(resolved, e.name)).size : undefined,
        }));
        return { action: 'list', path: filePath, items, total: entries.length, showing: items.length };
      } catch { return { error: `No se puede listar: ${filePath}` }; }
    }
    case 'search': {
      const pattern = String(body.pattern || '');
      if (!pattern) return { error: 'Patrón de búsqueda no especificado' };
      try {
        const output = execSync(`grep -rl --include='*' '${pattern.replace(/'/g, "'\\''")}' '${resolved}' 2>/dev/null | head -20`, {
          timeout: 10_000, encoding: 'utf-8',
        });
        const files = output.trim().split('\n').filter(Boolean);
        return { action: 'search', path: filePath, pattern, matches: files, count: files.length };
      } catch { return { action: 'search', path: filePath, pattern, matches: [], count: 0 }; }
    }
    default: return { error: `Acción no válida: ${action}` };
  }
}

// ─── Server ───

const server = http.createServer(async (req, res) => {
  // CORS for Docker internal
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Auth check
  if (req.url !== '/health') {
    const auth = req.headers['authorization'];
    if (!auth || auth !== `Bearer ${TOKEN}`) {
      return respond(res, 401, { error: 'Unauthorized' });
    }
  }

  // Routes
  if (req.url === '/health' && req.method === 'GET') {
    return respond(res, 200, {
      status: 'ok',
      agent: 'docatflow-host-agent',
      version: '1.0.0',
      hostname: execSync('hostname', { encoding: 'utf-8' }).trim(),
      uptime: process.uptime(),
      services: SERVICES.map(s => s.name),
    });
  }

  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });

  const body = await readBody(req);

  switch (req.url) {
    case '/execute':
      return respond(res, 200, handleExecute(body));
    case '/service':
      return respond(res, 200, handleService(body));
    case '/files':
      return respond(res, 200, handleFiles(body));
    default:
      return respond(res, 404, { error: 'Not found' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[host-agent] DoCatFlow Host Agent running on port ${PORT}`);
  console.log(`[host-agent] Allowed dirs: ${ALLOWED_DIRS.join(', ')}`);
  console.log(`[host-agent] Services: ${SERVICES.map(s => s.name).join(', ')}`);
});
