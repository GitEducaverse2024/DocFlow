export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import {
  hashPassword,
  verifyPassword,
  createSudoSession,
  getSudoSessionInfo,
  revokeSudoSession,
  checkLockout,
  recordFailedAttempt,
  clearLockout,
} from '@/lib/sudo';

interface SudoConfig {
  enabled: boolean;
  hash: string;
  duration_minutes: number;
  protected_actions: string[];
}

function getSudoConfig(): SudoConfig | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('catbot_sudo') as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as SudoConfig;
  } catch {
    return null;
  }
}

// POST — Verify password / Set password / Check status
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    // ─── SET PASSWORD ───
    if (action === 'set_password') {
      const { password, duration_minutes, protected_actions } = body;
      if (!password || password.length < 4) {
        return NextResponse.json({ error: 'La clave debe tener al menos 4 caracteres' }, { status: 400 });
      }

      const hash = hashPassword(password);
      const config: SudoConfig = {
        enabled: true,
        hash,
        duration_minutes: duration_minutes || 5,
        protected_actions: protected_actions || ['bash_execute', 'service_manage', 'file_operation', 'credential_manage', 'mcp_bridge'],
      };

      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
        'catbot_sudo',
        JSON.stringify(config),
        new Date().toISOString()
      );

      return NextResponse.json({ success: true, message: 'Clave sudo configurada' });
    }

    // ─── VERIFY PASSWORD (login) ───
    if (action === 'verify') {
      const { password, client_id } = body;
      const clientId = client_id || 'default';

      // Check lockout
      const lockout = checkLockout(clientId);
      if (lockout.locked) {
        const mins = Math.ceil(lockout.remainingMs / 60000);
        return NextResponse.json(
          { error: `Demasiados intentos fallidos. Bloqueado por ${mins} minuto(s).`, locked: true, remaining_ms: lockout.remainingMs },
          { status: 429 }
        );
      }

      const config = getSudoConfig();
      if (!config || !config.enabled) {
        return NextResponse.json({ error: 'Sudo no configurado' }, { status: 404 });
      }

      if (!verifyPassword(password, config.hash)) {
        const result = recordFailedAttempt(clientId);
        if (result.locked) {
          return NextResponse.json(
            { error: 'Clave incorrecta. Máximo de intentos alcanzado. Bloqueado temporalmente.', locked: true },
            { status: 429 }
          );
        }
        return NextResponse.json(
          { error: `Clave incorrecta. ${result.attemptsRemaining} intento(s) restante(s).`, locked: false },
          { status: 401 }
        );
      }

      // Success — clear lockout, create session
      clearLockout(clientId);
      const token = createSudoSession(config.duration_minutes);
      const info = getSudoSessionInfo(token);

      return NextResponse.json({
        success: true,
        token,
        duration_minutes: config.duration_minutes,
        remaining_ms: info.remainingMs,
      });
    }

    // ─── CHECK STATUS ───
    if (action === 'check') {
      const { token } = body;
      const info = getSudoSessionInfo(token);
      const config = getSudoConfig();

      return NextResponse.json({
        active: info.active,
        remaining_ms: info.remainingMs,
        enabled: config?.enabled ?? false,
        protected_actions: config?.protected_actions ?? [],
      });
    }

    // ─── LOGOUT ───
    if (action === 'logout') {
      const { token } = body;
      if (token) revokeSudoSession(token);
      return NextResponse.json({ success: true });
    }

    // ─── UPDATE CONFIG (without changing password) ───
    if (action === 'update_config') {
      const { duration_minutes, protected_actions, enabled } = body;
      const config = getSudoConfig();
      if (!config) {
        return NextResponse.json({ error: 'Sudo no configurado. Establece una clave primero.' }, { status: 404 });
      }

      if (duration_minutes !== undefined) config.duration_minutes = duration_minutes;
      if (protected_actions !== undefined) config.protected_actions = protected_actions;
      if (enabled !== undefined) config.enabled = enabled;

      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
        'catbot_sudo',
        JSON.stringify(config),
        new Date().toISOString()
      );

      return NextResponse.json({ success: true, config: { ...config, hash: undefined } });
    }

    // ─── GET CONFIG (without hash) ───
    if (action === 'get_config') {
      const config = getSudoConfig();
      if (!config) {
        return NextResponse.json({ enabled: false, has_password: false, duration_minutes: 5, protected_actions: [] });
      }
      return NextResponse.json({
        enabled: config.enabled,
        has_password: !!config.hash,
        duration_minutes: config.duration_minutes,
        protected_actions: config.protected_actions,
      });
    }

    // ─── REMOVE PASSWORD ───
    if (action === 'remove_password') {
      db.prepare('DELETE FROM settings WHERE key = ?').run('catbot_sudo');
      return NextResponse.json({ success: true, message: 'Clave sudo eliminada' });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
