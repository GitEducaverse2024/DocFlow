export interface TestRunState {
  id: string;
  status: 'running' | 'passed' | 'failed';
  output: string;
  startedAt: number;
}

let currentRun: TestRunState | null = null;

export function getCurrentRun(): TestRunState | null {
  return currentRun;
}

export function setCurrentRun(run: TestRunState | null): void {
  currentRun = run;
}
