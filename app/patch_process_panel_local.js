const fs = require('fs');
const path = 'src/components/process/process-panel.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add state for useLocalProcessing
content = content.replace(
  /const \[instructions, setInstructions\] = useState\(''\);/,
  `const [instructions, setInstructions] = useState('');\n  const [useLocalProcessing, setUseLocalProcessing] = useState(true);`
);

// Update handleProcess to send useLocalProcessing
content = content.replace(
  /body: JSON\.stringify\(\{\s*sourceIds: Array\.from\(selectedSources\),\s*instructions\s*\}\)/,
  `body: JSON.stringify({
          sourceIds: Array.from(selectedSources),
          instructions,
          useLocalProcessing
        })`
);

// Add checkbox in UI
content = content.replace(
  /<Button\s*size="lg"\s*className="w-full h-14 text-lg bg-violet-500 hover:bg-violet-400 text-white"/,
  `<div className="flex items-center gap-2 mb-4 p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
            <Checkbox 
              id="local-processing" 
              checked={useLocalProcessing}
              onCheckedChange={(checked) => setUseLocalProcessing(checked as boolean)}
              className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
            />
            <div className="flex flex-col">
              <label htmlFor="local-processing" className="text-sm font-medium text-zinc-200 cursor-pointer">
                Procesamiento local directo
              </label>
              <span className="text-xs text-zinc-500">Bypass de n8n. Usa LiteLLM directamente.</span>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full h-14 text-lg bg-violet-500 hover:bg-violet-400 text-white"`
);

fs.writeFileSync(path, content);
