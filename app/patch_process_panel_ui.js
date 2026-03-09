const fs = require('fs');
const path = 'src/components/process/process-panel.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add History icon
content = content.replace(
  /Play, XCircle, Download, \}/,
  `Play, XCircle, Download, History, RefreshCw }`
);

// Update the success state to show buttons
content = content.replace(
  /if \(data\.status === 'completed'\) \{\s*toast\.success\('Procesamiento completado'\);\s*fetchPreview\(data\.version\);\s*\}/,
  `if (data.status === 'completed') {
                toast.success('Procesamiento completado');
                fetchPreview(data.version);
              }`
);

// Update the error state to show retry button
content = content.replace(
  /\{activeRun\?\.status === 'failed' && \(\s*<div className="bg-red-500\/10 border border-red-500\/20 rounded-lg p-4 mb-6">\s*<h4 className="text-red-500 font-medium mb-2 flex items-center gap-2">\s*<XCircle className="w-5 h-5" \/>\s*Error en el último procesamiento\s*<\/h4>\s*<p className="text-sm text-red-400\/80 whitespace-pre-wrap font-mono bg-red-950\/50 p-3 rounded">\s*\{activeRun\.error_log \|\| 'Error desconocido'\}\s*<\/p>\s*<\/div>\s*\)\}/,
  `{activeRun?.status === 'failed' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-red-500 font-medium mb-2 flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                Error en el último procesamiento
              </h4>
              <p className="text-sm text-red-400/80 whitespace-pre-wrap font-mono bg-red-950/50 p-3 rounded mb-3 max-h-40 overflow-y-auto">
                {activeRun.error_log || 'Error desconocido'}
              </p>
              <p className="text-sm text-zinc-400">
                Sugerencias: Intenta reducir el número de fuentes o verifica que el agente está configurado correctamente.
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={handleProcess}
              className="bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30 hover:text-red-300 flex-shrink-0"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reintentar
            </Button>
          </div>
        </div>
      )}`
);

// Update the success state to show preview and buttons
content = content.replace(
  /<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">/,
  `{activeRun?.status === 'completed' && !showPreview && previewContent && (
        <Card className="bg-zinc-900 border-emerald-500/30 mb-6 overflow-hidden">
          <div className="bg-emerald-500/10 px-6 py-4 border-b border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-emerald-500">Documento generado con éxito</h3>
                <p className="text-sm text-emerald-500/70">Versión {activeRun.version}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowPreview(true)} variant="outline" className="bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800">
                Ver completo
              </Button>
              <Button onClick={handleDownload} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                <Download className="w-4 h-4 mr-2" />
                Descargar .md
              </Button>
            </div>
          </div>
          <div className="p-6 max-h-60 overflow-y-hidden relative">
            <div className="prose prose-invert prose-sm max-w-none opacity-70">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {previewContent.substring(0, 500) + '...'}
              </ReactMarkdown>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none"></div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">`
);

fs.writeFileSync(path, content);
