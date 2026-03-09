const fs = require('fs');
const path = 'src/components/process/version-history.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /import \{ Dialog, DialogContent, DialogHeader, DialogTitle \} from '@\/components\/ui\/dialog';/,
  `import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';\nimport { HelpText } from '@/components/ui/help-text';`
);

content = content.replace(
  /<div className="text-center py-12 text-zinc-500 border border-zinc-800 border-dashed rounded-lg">\s*No hay historial de procesamiento para este proyecto\.\s*<\/div>/,
  `<div className="text-center py-12 text-zinc-500 border border-zinc-800 border-dashed rounded-lg flex flex-col items-center justify-center">
        <Clock className="w-12 h-12 text-zinc-700 mb-4" />
        <p>No hay versiones procesadas todavía. Ve a la pestaña Procesar para generar tu primer documento.</p>
      </div>`
);

fs.writeFileSync(path, content);
