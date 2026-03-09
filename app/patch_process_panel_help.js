const fs = require('fs');
const path = 'src/components/process/process-panel.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /import \{ Dialog, DialogContent, DialogHeader, DialogTitle \} from '@\/components\/ui\/dialog';/,
  `import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';\nimport { HelpText } from '@/components/ui/help-text';`
);

content = content.replace(
  /<CardTitle className="text-lg text-zinc-50">Fuentes a procesar<\/CardTitle>/,
  `<div className="flex items-center gap-2">\n                <CardTitle className="text-lg text-zinc-50">Fuentes a procesar</CardTitle>\n                <HelpText text="Selecciona las fuentes a incluir y lanza el procesamiento. El agente generará un documento estructurado a partir de la documentación seleccionada." />\n              </div>`
);

fs.writeFileSync(path, content);
