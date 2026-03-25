export async function register() {
  if (process['env']['NEXT_RUNTIME'] === 'nodejs') {
    const { taskScheduler } = await import('@/lib/services/task-scheduler');
    taskScheduler.start();

    const { drivePollingService } = await import('@/lib/services/drive-polling');
    drivePollingService.start();
  }
}
