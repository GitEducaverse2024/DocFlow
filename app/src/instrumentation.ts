export async function register() {
  if (process['env']['NEXT_RUNTIME'] === 'nodejs') {
    const { taskScheduler } = await import('@/lib/services/task-scheduler');
    taskScheduler.start();
  }
}
