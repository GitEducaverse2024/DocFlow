import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import { logger } from '@/lib/logger';

// --- Types ---

export type NotificationType = 'process' | 'rag' | 'task' | 'canvas' | 'connector' | 'system';
export type NotificationSeverity = 'success' | 'info' | 'warning' | 'error';

export interface CreateNotificationParams {
  type: NotificationType;
  title: string;
  message?: string;
  severity: NotificationSeverity;
  link?: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  severity: string;
  link: string | null;
  read: number;
  created_at: string;
}

// --- Service Functions ---

export function createNotification(params: CreateNotificationParams): void {
  try {
    const id = generateId();
    db.prepare(
      `INSERT INTO notifications (id, type, title, message, severity, link) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, params.type, params.title, params.message || null, params.severity, params.link || null);
  } catch (err) {
    logger.error('notifications', 'Error creating notification', { error: (err as Error).message });
  }
}

export function getNotifications(opts: {
  limit?: number;
  offset?: number;
  type?: string;
  severity?: string;
}): { notifications: Notification[]; total: number } {
  const { limit = 20, offset = 0, type, severity } = opts;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (severity) {
    conditions.push('severity = ?');
    params.push(severity);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM notifications ${whereClause}`).get(...params) as { c: number }
  ).c;

  const notifications = db
    .prepare(`SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Notification[];

  return { notifications, total };
}

export function getUnreadCount(): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE read = 0').get() as { c: number };
  return row.c;
}

export function markAsRead(id: string): void {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
}

export function markAllAsRead(): void {
  db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
}
