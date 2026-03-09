const fs = require('fs');
const path = 'src/app/projects/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /import \{ RagPanel \} from '@\/components\/rag\/rag-panel';/,
  `import { RagPanel } from '@/components/rag/rag-panel';\nimport { HelpText } from '@/components/ui/help-text';`
);

content = content.replace(
  /<TabsContent value="sources" className="m-0">\s*<SourceManager projectId=\{project\.id\} \/>\s*<\/TabsContent>/,
  `<TabsContent value="sources" className="m-0">
            <div className="mb-6">
              <HelpText text="Gestiona las fuentes de tu proyecto. El orden determina la secuencia en que el agente procesará la documentación." />
            </div>
            <SourceManager projectId={project.id} />
          </TabsContent>`
);

content = content.replace(
  /<TabsContent value="process" className="m-0">\s*<ProcessPanel project=\{project\} onProjectUpdate=\{.*?\} \/>\s*<\/TabsContent>/,
  `<TabsContent value="process" className="m-0">
            <div className="mb-6">
              <HelpText text="Selecciona las fuentes a incluir y lanza el procesamiento. El agente generará un documento estructurado a partir de la documentación seleccionada." />
            </div>
            <ProcessPanel project={project} onProjectUpdate={() => setRefreshTrigger(prev => prev + 1)} />
          </TabsContent>`
);

content = content.replace(
  /<TabsContent value="history" className="m-0">\s*<VersionHistory project=\{project\} \/>\s*<\/TabsContent>/,
  `<TabsContent value="history" className="m-0">
            <div className="mb-6">
              <HelpText text="Historial de todas las versiones generadas. Cada procesamiento crea una nueva versión sin borrar las anteriores." />
            </div>
            <VersionHistory project={project} />
          </TabsContent>`
);

content = content.replace(
  /<TabsContent value="rag" className="m-0">\s*<RagPanel project=\{project\} onProjectUpdate=\{.*?\} \/>\s*<\/TabsContent>/,
  `<TabsContent value="rag" className="m-0">
            <div className="mb-6">
              <HelpText text="Indexa tus documentos procesados en una base vectorial para consulta inteligente vía MCP." />
            </div>
            <RagPanel project={project} onProjectUpdate={() => setRefreshTrigger(prev => prev + 1)} />
          </TabsContent>`
);

fs.writeFileSync(path, content);
