const fs = require('fs');
const path = 'src/components/process/process-panel.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add Select imports
content = content.replace(
  /import \{ RadioGroup, RadioGroupItem \} from '@\/components\/ui\/radio-group';/,
  `import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';\nimport { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';`
);

// Add state for models and selectedModel
content = content.replace(
  /const \[useLocalProcessing, setUseLocalProcessing\] = useState\(true\);/,
  `const [useLocalProcessing, setUseLocalProcessing] = useState(true);\n  const [models, setModels] = useState<string[]>([]);\n  const [selectedModel, setSelectedModel] = useState<string>('');`
);

// Fetch models
content = content.replace(
  /fetch\('\/api\/agents'\),/,
  `fetch('/api/agents'),\n          fetch('/api/health'),`
);

content = content.replace(
  /const \[sourcesRes, agentsRes, statusRes\] = await Promise\.all\(\[/,
  `const [sourcesRes, agentsRes, healthRes, statusRes] = await Promise.all([`
);

content = content.replace(
  /if \(agentsRes\.ok\) \{\s*setAgents\(await agentsRes\.json\(\)\);\s*\}/,
  `if (agentsRes.ok) {
          setAgents(await agentsRes.json());
        }

        if (healthRes.ok) {
          const healthData = await healthRes.json();
          if (healthData.litellm?.models) {
            setModels(healthData.litellm.models);
          }
        }`
);

// Set default model when agent changes
content = content.replace(
  /const currentAgent = agents\.find\(\(a: \{ id: string, name: string, emoji: string, model: string, description\?: string \}\) => a\.id === project\.agent_id\);/,
  `const currentAgent = agents.find((a: { id: string, name: string, emoji: string, model: string, description?: string }) => a.id === project?.agent_id);

  useEffect(() => {
    if (currentAgent && !selectedModel) {
      setSelectedModel(currentAgent.model);
    } else if (!selectedModel && models.length > 0) {
      setSelectedModel(models[0]);
    }
  }, [currentAgent, models, selectedModel]);`
);

// Update handleProcess to send model
content = content.replace(
  /useLocalProcessing\s*\}\)/,
  `useLocalProcessing,\n          model: selectedModel\n        })`
);

// Add model selector UI
content = content.replace(
  /<Button\s*size="lg"\s*className="w-full h-14 text-lg bg-violet-500 hover:bg-violet-400 text-white"/,
  `<div className="space-y-2 mb-6">
            <div className="flex items-center gap-2">
              <Label className="text-zinc-300">Modelo LLM</Label>
              <HelpText text="Selecciona el modelo que procesará tu documentación. Modelos más potentes dan mejores resultados pero son más lentos." />
            </div>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-50">
                <SelectValue placeholder="Selecciona un modelo" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
                {models.length > 0 ? (
                  models.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))
                ) : (
                  <SelectItem value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="lg"
            className="w-full h-14 text-lg bg-violet-500 hover:bg-violet-400 text-white"`
);

fs.writeFileSync(path, content);
