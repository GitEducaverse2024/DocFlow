const fs = require('fs');
const path = 'src/components/process/version-history.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add GitCompare icon
content = content.replace(
  /Loader2, Clock, Download, Eye, AlertCircle, CheckCircle2, XCircle/,
  `Loader2, Clock, Download, Eye, AlertCircle, CheckCircle2, XCircle, GitCompare, ChevronDown, ChevronUp`
);

// Add state for expanded cards
content = content.replace(
  /const \[showError, setShowError\] = useState\(false\);\n  const \[errorContent, setErrorContent\] = useState\(''\);/,
  `const [showError, setShowError] = useState(false);\n  const [errorContent, setErrorContent] = useState('');\n  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());\n  const [runPreviews, setRunPreviews] = useState<Record<string, string>>({});`
);

// Add toggleExpand function
content = content.replace(
  /const fetchPreview = async \(version: number\) => \{/,
  `const toggleExpand = async (runId: string, version: number) => {
    const newExpanded = new Set(expandedRuns);
    if (newExpanded.has(runId)) {
      newExpanded.delete(runId);
      setExpandedRuns(newExpanded);
    } else {
      newExpanded.add(runId);
      setExpandedRuns(newExpanded);
      
      if (!runPreviews[runId]) {
        try {
          const res = await fetch(\`/api/projects/\${project.id}/process/\${version}/output\`);
          if (res.ok) {
            const data = await res.json();
            setRunPreviews(prev => ({ ...prev, [runId]: data.content }));
          }
        } catch (error) {
          console.error('Error fetching preview:', error);
        }
      }
    }
  };

  const fetchPreview = async (version: number) => {`
);

// Update the empty state
content = content.replace(
  /<div className="text-center py-12 text-zinc-500 border border-zinc-800 border-dashed rounded-lg">\s*No hay historial de procesamiento para este proyecto\.\s*<\/div>/,
  `<div className="text-center py-12 text-zinc-500 border border-zinc-800 border-dashed rounded-lg flex flex-col items-center justify-center">
        <Clock className="w-12 h-12 text-zinc-700 mb-4" />
        <p>No hay versiones procesadas todavía. Ve a la pestaña Procesar para generar tu primer documento.</p>
      </div>`
);

// Update the card rendering
content = content.replace(
  /<Card key=\{run\.id\} className=\{`bg-zinc-900 border-zinc-800 \$\{run\.status === 'failed' \? 'border-red-900\/50' : ''\}`\}>\s*<CardContent className="p-6">\s*<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">/,
  `<Card key={run.id} className={\`bg-zinc-900 border-zinc-800 \${run.status === 'failed' ? 'border-red-900/50' : ''}\`}>
          <CardContent className="p-0">
            <div 
              className={\`p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 \${run.status === 'completed' ? 'cursor-pointer hover:bg-zinc-800/30 transition-colors' : ''}\`}
              onClick={() => run.status === 'completed' && toggleExpand(run.id, run.version)}
            >`
);

// Add expand icon and content
content = content.replace(
  /<\/div>\s*<\/CardContent>\s*<\/Card>/g,
  `</div>
            
            {expandedRuns.has(run.id) && run.status === 'completed' && (
              <div className="px-6 pb-6 pt-2 border-t border-zinc-800/50 mt-2">
                <div className="bg-zinc-950 rounded-lg p-4 relative overflow-hidden">
                  <div className="prose prose-invert prose-sm max-w-none opacity-80">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {runPreviews[run.id] ? runPreviews[run.id].substring(0, 500) + (runPreviews[run.id].length > 500 ? '...' : '') : 'Cargando...'}
                    </ReactMarkdown>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none"></div>
                </div>
                <div className="flex justify-end mt-4 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); fetchPreview(run.version); }}
                    className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Ver completo
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); handleDownload(run.version); }}
                    className="bg-violet-500 hover:bg-violet-400 text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Descargar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>`
);

// Add comparison text at the end
content = content.replace(
  /<\/DialogContent>\s*<\/Dialog>\s*<\/div>\s*\);\s*\}/,
  `</DialogContent>
      </Dialog>

      <div className="flex items-center justify-center py-6 text-zinc-500 text-sm">
        <GitCompare className="w-4 h-4 mr-2 opacity-50" />
        Comparación entre versiones — próximamente
      </div>
    </div>
  );
}`
);

// Remove the old buttons from the header if it's completed, since they are now in the expanded view
content = content.replace(
  /\{run\.status === 'completed' && \(\s*<>\s*<Button\s*variant="outline"\s*size="sm"\s*onClick=\{.*?\}\s*className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"\s*>\s*<Eye className="w-4 h-4 mr-2" \/>\s*Ver documento\s*<\/Button>\s*<Button\s*size="sm"\s*onClick=\{.*?\}\s*className="bg-violet-500 hover:bg-violet-400 text-white"\s*>\s*<Download className="w-4 h-4 mr-2" \/>\s*Descargar\s*<\/Button>\s*<\/>\s*\)\}/,
  `{run.status === 'completed' && (
                  <div className="text-zinc-500">
                    {expandedRuns.has(run.id) ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                )}`
);

fs.writeFileSync(path, content);
