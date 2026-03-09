const fs = require('fs');
const path = 'src/components/process/process-panel.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add RadioGroup imports
content = content.replace(
  /import \{ Dialog, DialogContent, DialogHeader, DialogTitle \} from '@\/components\/ui\/dialog';/,
  `import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';\nimport { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';\nimport { Label } from '@/components/ui/label';`
);

// Add state for agent dialog
content = content.replace(
  /const \[showPreview, setShowPreview\] = useState\(false\);\n  const \[previewContent, setPreviewContent\] = useState\(''\);/,
  `const [showPreview, setShowPreview] = useState(false);\n  const [previewContent, setPreviewContent] = useState('');\n  const [showAgentDialog, setShowAgentDialog] = useState(false);\n  const [selectedAgent, setSelectedAgent] = useState<string>(project.agent_id || 'none');\n  const [isUpdatingAgent, setIsUpdatingAgent] = useState(false);`
);

// Add handleUpdateAgent function
content = content.replace(
  /const handleProcess = async \(\) => \{/,
  `const handleUpdateAgent = async () => {
    try {
      setIsUpdatingAgent(true);
      const newAgentId = selectedAgent === 'none' ? null : selectedAgent;
      
      const res = await fetch(\`/api/projects/\${project.id}\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: newAgentId })
      });
      
      if (!res.ok) throw new Error('Error al actualizar agente');
      
      toast.success('Agente actualizado');
      setShowAgentDialog(false);
      onProjectUpdate();
    } catch (error) {
      toast.error('Error al actualizar el agente');
      console.error(error);
    } finally {
      setIsUpdatingAgent(false);
    }
  };

  const handleProcess = async () => {`
);

// Update the agent card buttons
content = content.replace(
  /<Button\s*variant="outline"\s*className="w-full bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"\s*>\s*Cambiar agente\s*<\/Button>/,
  `<Button
                    variant="outline"
                    onClick={() => { setSelectedAgent(project.agent_id || 'none'); setShowAgentDialog(true); }}
                    className="w-full bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                  >
                    Cambiar agente
                  </Button>`
);

content = content.replace(
  /<Button\s*className="w-full bg-violet-500 hover:bg-violet-400 text-white"\s*>\s*Asignar agente\s*<\/Button>/,
  `<Button
                    onClick={() => { setSelectedAgent('none'); setShowAgentDialog(true); }}
                    className="w-full bg-violet-500 hover:bg-violet-400 text-white"
                  >
                    Asignar agente
                  </Button>`
);

// Add the agent dialog at the end
content = content.replace(
  /<\/DialogContent>\s*<\/Dialog>\s*<\/div>\s*\);\s*\}/,
  `</DialogContent>
      </Dialog>

      <Dialog open={showAgentDialog} onOpenChange={setShowAgentDialog}>
        <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-zinc-50">Seleccionar Agente IA</DialogTitle>
          </DialogHeader>
          
          <div className="py-4 max-h-[60vh] overflow-y-auto pr-2">
            {agents.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                No hay agentes disponibles. Verifica la conexión con OpenClaw.
              </div>
            ) : (
              <RadioGroup value={selectedAgent} onValueChange={setSelectedAgent} className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  {agents.map((agent) => (
                    <div key={agent.id}>
                      <RadioGroupItem value={agent.id} id={\`agent-\${agent.id}\`} className="peer sr-only" />
                      <Label
                        htmlFor={\`agent-\${agent.id}\`}
                        className="flex flex-col gap-2 p-4 border border-zinc-800 rounded-lg cursor-pointer bg-zinc-950 hover:bg-zinc-900 peer-data-[state=checked]:border-violet-500 peer-data-[state=checked]:bg-violet-500/5 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{agent.emoji}</span>
                            <span className="font-semibold text-zinc-50">{agent.name}</span>
                          </div>
                          <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 border-0">
                            {agent.model}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-400">{agent.description}</p>
                      </Label>
                    </div>
                  ))}

                  <div>
                    <RadioGroupItem value="none" id="agent-none" className="peer sr-only" />
                    <Label
                      htmlFor="agent-none"
                      className="flex flex-col gap-2 p-4 border border-zinc-800 rounded-lg cursor-pointer bg-zinc-950 hover:bg-zinc-900 peer-data-[state=checked]:border-zinc-500 peer-data-[state=checked]:bg-zinc-800/50 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <Bot className="w-6 h-6 text-zinc-500" />
                        <span className="font-semibold text-zinc-50">Sin agente</span>
                      </div>
                      <p className="text-sm text-zinc-400">Desasignar el agente actual.</p>
                    </Label>
                  </div>
                </div>
              </RadioGroup>
            )}
          </div>
          
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <Button
              variant="outline"
              onClick={() => setShowAgentDialog(false)}
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpdateAgent}
              disabled={isUpdatingAgent || (selectedAgent === (project.agent_id || 'none'))}
              className="bg-violet-500 hover:bg-violet-400 text-white"
            >
              {isUpdatingAgent && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}`
);

fs.writeFileSync(path, content);
