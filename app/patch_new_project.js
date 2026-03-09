const fs = require('fs');
const path = 'src/app/projects/new/page.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /\) : agentsError \? \([\s\S]*?\) : \(\s*<RadioGroup value=\{selectedAgent\} onValueChange=\{setSelectedAgent\} className="space-y-4">/,
  `) : agentsError || (agents.length === 0 && !isFallback) ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-zinc-50 mb-2">No se encontraron agentes</h3>
                  <p className="text-zinc-400 mb-6">
                    No hay agentes disponibles. Configura agentes en OpenClaw o añade OPENCLAW_AGENTS en el .env
                  </p>
                  <Button
                    onClick={() => {
                      setSelectedAgent('none');
                      handleFinish();
                    }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-50"
                  >
                    Continuar sin agente
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {isFallback && agents.length > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-sm text-amber-400">
                      No se pudieron obtener los agentes desde OpenClaw. Mostrando agentes configurados manualmente.
                    </div>
                  )}
                  <RadioGroup value={selectedAgent} onValueChange={setSelectedAgent} className="space-y-4">`
);

content = content.replace(
  /<\/RadioGroup>\s*\)\}\s*<\/div>\s*\)\}/,
  `</RadioGroup>\n                </div>\n              )}\n            </div>\n          )}`
);

fs.writeFileSync(path, content);
