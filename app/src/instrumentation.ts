export async function register() {
  if (process['env']['NEXT_RUNTIME'] === 'nodejs') {
    const { taskScheduler } = await import('@/lib/services/task-scheduler');
    taskScheduler.start();

    // Start Drive polling daemon (skip in test env)
    if (process['env']['NODE_ENV'] !== 'test') {
      try {
        const { drivePollingService } = await import('@/lib/services/drive-polling');
        drivePollingService.start();
      } catch (err) {
        console.error('[instrumentation] Failed to start DrivePollingService:', err);
      }

      // Start Telegram bot service (skip in test env)
      try {
        const { telegramBotService } = await import('@/lib/services/telegram-bot');
        telegramBotService.start();
      } catch (err) {
        console.error('[instrumentation] Failed to start TelegramBotService:', err);
      }

      // Start CatBot Summary scheduler (compresses conversations into daily/weekly/monthly summaries)
      try {
        const { SummaryService } = await import('@/lib/services/catbot-summary');
        SummaryService.start();
      } catch (err) {
        console.error('[instrumentation] Failed to start SummaryService:', err);
      }

      // Start AlertService (system health checks every 5min)
      try {
        const { AlertService } = await import('@/lib/services/alert-service');
        AlertService.start();
      } catch (err) {
        console.error('[instrumentation] Failed to start AlertService:', err);
      }

      // Start IntentWorker (re-queues failed intents for LLM-driven retry every 5min)
      try {
        const { IntentWorker } = await import('@/lib/services/intent-worker');
        IntentWorker.start();
      } catch (err) {
        console.error('[instrumentation] Failed to start IntentWorker:', err);
      }

      // Start IntentJobExecutor (async CatFlow pipeline worker — 3-phase LLM driver)
      try {
        const { IntentJobExecutor } = await import('@/lib/services/intent-job-executor');
        IntentJobExecutor.start();
      } catch (err) {
        console.error('[instrumentation] Failed to start IntentJobExecutor:', err);
      }
    }
  }
}
