const fs = require('fs');
const path = 'src/components/rag/rag-panel.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add Bot icon
content = content.replace(
  /Database, Search, Trash2, RefreshCw, Copy, CheckCircle2, AlertCircle/,
  `Database, Search, Trash2, RefreshCw, Copy, CheckCircle2, AlertCircle, Bot`
);

// Update handleIndex to create bot
content = content.replace(
  /toast\.success\('Indexación completada'\);\s*onProjectUpdate\(\);\s*fetchRagInfo\(\);/,
  `toast.success('Indexación completada');
      
      // Create bot automatically
      try {
        await fetch(\`/api/projects/\${project.id}/bot/create\`, { method: 'POST' });
      } catch (e) {
        console.error('Error creating bot:', e);
      }
      
      onProjectUpdate();
      fetchRagInfo();`
);

// Add Bot section to UI
content = content.replace(
  /<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">/,
  `{project.bot_created === 1 && project.bot_agent_id && (
        <Card className="bg-zinc-900 border-violet-500/30 overflow-hidden">
          <div className="bg-violet-500/10 px-6 py-4 border-b border-violet-500/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-500">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-violet-400">Bot Experto Creado</h3>
              <p className="text-sm text-violet-400/70">Tu asistente especializado está listo para usar</p>
            </div>
          </div>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-zinc-400 mb-1">Nombre</p>
                <p className="font-medium text-zinc-50 mb-4">Experto {project.name}</p>
                
                <p className="text-sm text-zinc-400 mb-1">ID del Agente</p>
                <code className="bg-zinc-950 px-2 py-1 rounded text-violet-400 text-sm">{project.bot_agent_id}</code>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-zinc-400 mb-2">1. Actívalo en OpenClaw:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-zinc-950 px-3 py-2 rounded text-zinc-300 text-sm">openclaw agents add {project.bot_agent_id}</code>
                    <Button size="icon" variant="ghost" onClick={() => {
                      navigator.clipboard.writeText(\`openclaw agents add \${project.bot_agent_id}\`);
                      toast.success('Comando copiado');
                    }} className="h-9 w-9 text-zinc-400 hover:text-zinc-50">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-zinc-400 mb-2">2. Chatea con él:</p>
                  <a 
                    href={\`http://127.0.0.1:18789/chat?session=agent:\${project.bot_agent_id}:\${project.bot_agent_id}\`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-violet-600 text-white hover:bg-violet-700 h-9 px-4 py-2 w-full"
                  >
                    Abrir en OpenClaw
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">`
);

fs.writeFileSync(path, content);
