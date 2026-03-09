const fs = require('fs');
const path = 'src/components/rag/rag-panel.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add HelpText import
content = content.replace(
  /import \{ toast \} from 'sonner';/,
  `import { toast } from 'sonner';\nimport { HelpText } from '@/components/ui/help-text';`
);

// Update empty state
content = content.replace(
  /<div className="text-center py-16 border border-zinc-800 border-dashed rounded-lg bg-zinc-900\/50">\s*<Database className="w-12 h-12 text-zinc-600 mx-auto mb-4" \/>\s*<h3 className="text-lg font-medium text-zinc-50 mb-2">RAG no disponible<\/h3>\s*<p className="text-zinc-400 max-w-md mx-auto">\s*Primero debes procesar las fuentes con un agente IA para generar el documento que será indexado\.\s*<\/p>\s*<\/div>/,
  `<div className="text-center py-16 border border-zinc-800 border-dashed rounded-lg bg-zinc-900/50 flex flex-col items-center justify-center">
        <Database className="w-16 h-16 text-zinc-700 mb-4" />
        <h3 className="text-xl font-medium text-zinc-50 mb-2">Para usar RAG, primero necesitas procesar tus fuentes con un agente IA.</h3>
        <p className="text-zinc-400 max-w-md mx-auto mb-6">
          El RAG indexa los documentos generados en una base vectorial para que puedas consultarlos de forma inteligente.
        </p>
        <Button 
          onClick={() => {
            // Find the process tab trigger and click it
            const processTab = document.querySelector('[value="process"]') as HTMLElement;
            if (processTab) processTab.click();
          }}
          className="bg-violet-500 hover:bg-violet-400 text-white"
        >
          Ir a Procesar
        </Button>
      </div>`
);

// Update config form with help texts
content = content.replace(
  /<Label className="text-zinc-300">Modelo de Embeddings<\/Label>/,
  `<div className="flex items-center gap-2 mb-2">
                <Label className="text-zinc-300">Modelo de Embeddings</Label>
                <HelpText text="Modelo de embeddings para generar vectores. text-embedding-3-small es más rápido y económico." />
              </div>`
);

content = content.replace(
  /<div className="flex justify-between">\s*<Label className="text-zinc-300">Tamaño del Chunk \(caracteres\)<\/Label>/,
  `<div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Label className="text-zinc-300">Tamaño del Chunk (caracteres)</Label>
                  <HelpText text="Tamaño de cada fragmento de texto. Valores más grandes dan más contexto pero menos precisión." />
                </div>`
);

content = content.replace(
  /<div className="flex justify-between">\s*<Label className="text-zinc-300">Solapamiento \(caracteres\)<\/Label>/,
  `<div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Label className="text-zinc-300">Solapamiento (caracteres)</Label>
                  <HelpText text="Solapamiento entre fragmentos. Evita que información quede cortada entre chunks." />
                </div>`
);

// Update results to be expandable
content = content.replace(
  /const \[results, setResults\] = useState<\{ score: number, payload: \{ chunk_index: number, text: string \} \}\[\]>\(\[\]\);/,
  `const [results, setResults] = useState<{ score: number, payload: { chunk_index: number, text: string } }[]>([]);\n  const [expandedResult, setExpandedResult] = useState<number | null>(null);`
);

content = content.replace(
  /\{results\.map\(\(result, idx\) => \(\s*<div key=\{idx\} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">\s*<div className="flex items-center justify-between mb-2">\s*<Badge variant="outline" className="bg-zinc-900 border-zinc-700 text-zinc-400 text-xs">\s*Chunk \{result\.payload\?\.chunk_index\}\s*<\/Badge>\s*<span className="text-xs font-medium text-emerald-500">\s*Score: \{\(result\.score \* 100\)\.toFixed\(1\)\}%*\s*<\/span>\s*<\/div>\s*<p className="text-sm text-zinc-300 line-clamp-4">\s*\{result\.payload\?\.text\}\s*<\/p>\s*<\/div>\s*\)\}/,
  `{results.map((result, idx) => (
                <div 
                  key={idx} 
                  className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg cursor-pointer hover:border-zinc-700 transition-colors"
                  onClick={() => setExpandedResult(expandedResult === idx ? null : idx)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-violet-500/10 text-violet-500 border-0 text-xs">
                        #{idx + 1}
                      </Badge>
                      <Badge variant="outline" className="bg-zinc-900 border-zinc-700 text-zinc-400 text-xs">
                        Chunk {result.payload?.chunk_index}
                      </Badge>
                    </div>
                    <span className="text-xs font-medium text-emerald-500">
                      Score: {(result.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className={\`text-sm text-zinc-300 \${expandedResult === idx ? '' : 'line-clamp-3'}\`}>
                    {result.payload?.text}
                  </p>
                </div>
              ))}`
);

fs.writeFileSync(path, content);
