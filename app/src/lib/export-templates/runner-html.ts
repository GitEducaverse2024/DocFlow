// ---------------------------------------------------------------------------
// Runner HTML template generator
// ---------------------------------------------------------------------------

/**
 * Generate a standalone HTML page for executing and monitoring a task.
 * Dark theme (#0a0a0a bg, #7c3aed violet accent), polls every 2s.
 */
export function generateRunnerHtml(taskId: string, taskName: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DocFlow Runner - ${escapeHtml(taskName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e4e4e7;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem;
    }
    .container { max-width: 640px; width: 100%; }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #fafafa;
    }
    .subtitle {
      color: #71717a;
      font-size: 0.875rem;
      margin-bottom: 2rem;
    }
    .btn-execute {
      background: #7c3aed;
      color: #fff;
      border: none;
      padding: 0.75rem 2rem;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      width: 100%;
      transition: background 0.15s;
    }
    .btn-execute:hover { background: #6d28d9; }
    .btn-execute:disabled {
      background: #3f3f46;
      cursor: not-allowed;
    }
    .progress-bar-container {
      margin-top: 1.5rem;
      background: #27272a;
      border-radius: 0.5rem;
      height: 0.5rem;
      overflow: hidden;
      display: none;
    }
    .progress-bar {
      height: 100%;
      background: #7c3aed;
      transition: width 0.3s ease;
      width: 0%;
    }
    .steps-container {
      margin-top: 1.5rem;
      display: none;
    }
    .step {
      padding: 0.75rem 1rem;
      border-left: 3px solid #3f3f46;
      margin-bottom: 0.5rem;
      background: #18181b;
      border-radius: 0 0.375rem 0.375rem 0;
    }
    .step.pending { border-left-color: #71717a; }
    .step.running { border-left-color: #f59e0b; }
    .step.completed { border-left-color: #22c55e; }
    .step.failed { border-left-color: #ef4444; }
    .step-name {
      font-size: 0.875rem;
      font-weight: 500;
    }
    .step-status {
      font-size: 0.75rem;
      color: #a1a1aa;
      margin-top: 0.25rem;
    }
    .result-area {
      margin-top: 1.5rem;
      display: none;
    }
    .result-box {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 0.5rem;
      padding: 1rem;
      font-size: 0.875rem;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 400px;
      overflow-y: auto;
    }
    .btn-download {
      margin-top: 0.75rem;
      background: #22c55e;
      color: #fff;
      border: none;
      padding: 0.5rem 1.5rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      cursor: pointer;
    }
    .btn-download:hover { background: #16a34a; }
    .error-area {
      margin-top: 1.5rem;
      display: none;
      background: #1c0a0a;
      border: 1px solid #7f1d1d;
      border-radius: 0.5rem;
      padding: 1rem;
      color: #fca5a5;
      font-size: 0.875rem;
    }
    .status-text {
      margin-top: 1rem;
      font-size: 0.875rem;
      color: #a1a1aa;
      text-align: center;
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(taskName)}</h1>
    <p class="subtitle">Task ID: ${escapeHtml(taskId)}</p>

    <button class="btn-execute" id="btnExecute" onclick="executeTask()">
      Ejecutar tarea
    </button>

    <div class="status-text" id="statusText"></div>

    <div class="progress-bar-container" id="progressBarContainer">
      <div class="progress-bar" id="progressBar"></div>
    </div>

    <div class="steps-container" id="stepsContainer"></div>

    <div class="result-area" id="resultArea">
      <h3 style="margin-bottom:0.75rem;font-size:1rem;">Resultado</h3>
      <div class="result-box" id="resultBox"></div>
      <button class="btn-download" onclick="downloadResult()">Descargar resultado</button>
    </div>

    <div class="error-area" id="errorArea"></div>
  </div>

  <script>
    const TASK_ID = '${escapeHtml(taskId)}';
    const BASE_URL = 'http://localhost:3500';
    let pollTimer = null;
    let lastResult = '';

    async function executeTask() {
      const btn = document.getElementById('btnExecute');
      btn.disabled = true;
      btn.textContent = 'Ejecutando...';

      document.getElementById('progressBarContainer').style.display = 'block';
      document.getElementById('stepsContainer').style.display = 'block';
      document.getElementById('statusText').style.display = 'block';
      document.getElementById('resultArea').style.display = 'none';
      document.getElementById('errorArea').style.display = 'none';

      try {
        const res = await fetch(BASE_URL + '/api/tasks/' + TASK_ID + '/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || 'Failed to start execution');
        }

        document.getElementById('statusText').textContent = 'Polling status...';
        pollTimer = setInterval(pollStatus, 2000);
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = 'Ejecutar tarea';
      }
    }

    async function pollStatus() {
      try {
        const res = await fetch(BASE_URL + '/api/tasks/' + TASK_ID + '/status');
        if (!res.ok) throw new Error('Status request failed');

        const data = await res.json();
        renderSteps(data.steps || []);
        updateProgress(data.steps || []);

        document.getElementById('statusText').textContent =
          'Estado: ' + (data.status || 'unknown');

        if (data.status === 'completed') {
          clearInterval(pollTimer);
          pollTimer = null;
          lastResult = data.result_output || data.output || 'Tarea completada.';
          document.getElementById('resultBox').textContent = lastResult;
          document.getElementById('resultArea').style.display = 'block';
          document.getElementById('statusText').textContent = 'Completado';
          document.getElementById('btnExecute').textContent = 'Ejecutar tarea';
          document.getElementById('btnExecute').disabled = false;
        } else if (data.status === 'failed') {
          clearInterval(pollTimer);
          pollTimer = null;
          showError(data.error || 'La tarea fallo.');
          document.getElementById('btnExecute').textContent = 'Ejecutar tarea';
          document.getElementById('btnExecute').disabled = false;
        }
      } catch (err) {
        // Silently retry on transient errors
      }
    }

    function renderSteps(steps) {
      const container = document.getElementById('stepsContainer');
      container.innerHTML = steps.map(function(s) {
        const status = s.status || 'pending';
        const name = s.name || ('Step ' + (s.order_index + 1));
        return '<div class="step ' + status + '">' +
          '<div class="step-name">' + escapeHtml(name) + '</div>' +
          '<div class="step-status">' + status + '</div>' +
        '</div>';
      }).join('');
    }

    function updateProgress(steps) {
      if (steps.length === 0) return;
      const completed = steps.filter(function(s) {
        return s.status === 'completed';
      }).length;
      const pct = Math.round((completed / steps.length) * 100);
      document.getElementById('progressBar').style.width = pct + '%';
    }

    function showError(msg) {
      const el = document.getElementById('errorArea');
      el.textContent = msg;
      el.style.display = 'block';
    }

    function downloadResult() {
      const blob = new Blob([lastResult], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'resultado-' + TASK_ID + '.txt';
      a.click();
      URL.revokeObjectURL(url);
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
}

/** Escape HTML special characters for safe embedding in templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
