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
    }
  }
}
