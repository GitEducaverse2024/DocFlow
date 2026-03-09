const fs = require('fs');
const path = 'src/components/sources/source-manager.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /import \{ FileText, Link as LinkIcon, Youtube, StickyNote \} from 'lucide-react';/,
  `import { FileText, Link as LinkIcon, Youtube, StickyNote } from 'lucide-react';\nimport { HelpText } from '@/components/ui/help-text';`
);

content = content.replace(
  /<TabsContent value="files" className="m-0">/,
  `<TabsContent value="files" className="m-0">\n              <div className="mb-4">\n                <HelpText text="Arrastra archivos o carpetas completas. Soporta PDF, DOCX, TXT, MD, CSV, imágenes, código y más. Máximo 50MB por archivo." />\n              </div>`
);

content = content.replace(
  /<TabsContent value="urls" className="m-0">/,
  `<TabsContent value="urls" className="m-0">\n              <div className="mb-4">\n                <HelpText text="Pega URLs de páginas web. Se intentará obtener el título automáticamente. El contenido se extraerá durante el procesamiento." />\n              </div>`
);

content = content.replace(
  /<TabsContent value="youtube" className="m-0">/,
  `<TabsContent value="youtube" className="m-0">\n              <div className="mb-4">\n                <HelpText text="Pega URLs de vídeos de YouTube. El agente recibirá la referencia del vídeo para su análisis." />\n              </div>`
);

content = content.replace(
  /<TabsContent value="notes" className="m-0">/,
  `<TabsContent value="notes" className="m-0">\n              <div className="mb-4">\n                <HelpText text="Escribe notas, ideas o requisitos en texto libre. Puedes usar Markdown básico." />\n              </div>`
);

content = content.replace(
  /<h3 className="text-lg font-medium text-zinc-50 mb-4">Fuentes del proyecto<\/h3>/,
  `<div className="flex items-center gap-2 mb-4">\n          <h3 className="text-lg font-medium text-zinc-50">Fuentes del proyecto</h3>\n          <HelpText text="Gestiona las fuentes de tu proyecto. El orden determina la secuencia en que el agente procesará la documentación." />\n        </div>`
);

fs.writeFileSync(path, content);
