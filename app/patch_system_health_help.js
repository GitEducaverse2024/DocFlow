const fs = require('fs');
const path = 'src/components/system/system-health-panel.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /import \{ Card, CardContent, CardHeader, CardTitle \} from '@\/components\/ui\/card';/,
  `import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';\nimport { HelpText } from '@/components/ui/help-text';`
);

content = content.replace(
  /<h1 className="text-3xl font-bold text-zinc-50 mb-2">Estado del Sistema<\/h1>\s*<p className="text-zinc-400">Monitorización de servicios e infraestructura<\/p>/,
  `<h1 className="text-3xl font-bold text-zinc-50 mb-2">Estado del Sistema</h1>
          <div className="flex items-center gap-2">
            <p className="text-zinc-400">Monitorización de servicios e infraestructura</p>
            <HelpText text="Estado en tiempo real de los servicios de infraestructura. Pulsa Diagnosticar en un servicio caído para ver los pasos de resolución." />
          </div>`
);

fs.writeFileSync(path, content);
