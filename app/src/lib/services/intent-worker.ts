/**
 * IntentWorker — Background singleton that re-queues failed intents for
 * LLM-driven retry. NEVER re-executes tools directly — it only flips
 * status from 'failed' back to 'pending' (or abandons at MAX_ATTEMPTS).
 *
 * The retry loop closes when the user's next conversation turn picks up
 * the re-queued intent via PromptAssembler.buildOpenIntentsContext().
 */

import {
  getRetryableIntents,
  updateIntentStatus,
  abandonIntent,
} from '@/lib/catbot-db';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const BOOT_DELAY = 45_000;            // 45s — stagger after AlertService (30s)
const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export class IntentWorker {
  private static intervalId: ReturnType<typeof setInterval> | null = null;
  private static timeoutId: ReturnType<typeof setTimeout> | null = null;

  static start(): void {
    logger.info('intent-worker', 'Starting with boot delay', { delayMs: BOOT_DELAY });
    this.timeoutId = setTimeout(() => {
      this.tick().catch(err =>
        logger.error('intent-worker', 'Tick error', { error: String(err) })
      );
      this.intervalId = setInterval(() => {
        this.tick().catch(err =>
          logger.error('intent-worker', 'Tick error', { error: String(err) })
        );
      }, CHECK_INTERVAL);
    }, BOOT_DELAY);
  }

  static stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.intervalId = null;
    this.timeoutId = null;
  }

  static async tick(): Promise<void> {
    logger.info('intent-worker', 'Tick start');
    let retried = 0;
    let abandoned = 0;

    let failedIntents;
    try {
      failedIntents = getRetryableIntents(MAX_ATTEMPTS);
    } catch (err) {
      logger.error('intent-worker', 'getRetryableIntents failed', { error: String(err) });
      return;
    }

    for (const intent of failedIntents) {
      try {
        if (intent.attempts + 1 >= MAX_ATTEMPTS) {
          // The next retry would be the last allowed — mark abandoned instead.
          abandonIntent(
            intent.id,
            `Max retries (${MAX_ATTEMPTS}) reached. Last error: ${intent.last_error ?? 'unknown'}`,
          );
          abandoned++;
          logger.info('intent-worker', 'Intent abandoned', {
            id: intent.id,
            attempts: intent.attempts,
          });
          continue;
        }

        // Re-queue for LLM-driven retry. We do NOT re-execute tools here —
        // on the user's next turn, PromptAssembler.buildOpenIntentsContext
        // will surface this intent and CatBot will resume it.
        updateIntentStatus(intent.id, {
          status: 'pending',
          incrementAttempts: true,
        });
        retried++;
        logger.info('intent-worker', 'Intent re-queued for LLM retry', {
          id: intent.id,
          newAttempts: intent.attempts + 1,
        });
      } catch (err) {
        logger.error('intent-worker', 'Per-intent retry failed', {
          id: intent.id,
          error: String(err),
        });
      }
    }

    logger.info('intent-worker', 'Tick complete', { retried, abandoned });
  }
}
