const fs = require('fs');
const path = 'src/app/projects/new/page.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /import \{ SourceManager \} from '@\/components\/sources\/source-manager';/,
  `import { SourceManager } from '@/components/sources/source-manager';\nimport { HelpText } from '@/components/ui/help-text';`
);

content = content.replace(
  /<CardTitle className="text-xl text-zinc-50">\s*\{step === 1 && 'Información Básica'\}\s*\{step === 2 && 'Añadir Fuentes'\}\s*\{step === 3 && 'Asignar Agente IA'\}\s*<\/CardTitle>/,
  `<CardTitle className="text-xl text-zinc-50">
              {step === 1 && 'Información Básica'}
              {step === 2 && 'Añadir Fuentes'}
              {step === 3 && 'Asignar Agente IA'}
            </CardTitle>
            <div className="mt-2">
              {step === 1 && <HelpText text="Define los datos básicos del proyecto. El nombre y la finalidad son obligatorios." />}
              {step === 2 && <HelpText text="Sube todos los materiales que quieres que el agente analice. Puedes mezclar archivos, URLs, vídeos de YouTube y notas manuales." />}
              {step === 3 && <HelpText text="Selecciona el agente que procesará tu documentación. Cada agente está especializado en un tipo de análisis diferente." />}
            </div>`
);

content = content.replace(
  /<label className="block text-sm font-medium text-zinc-300 mb-2">\s*Finalidad <span className="text-red-500">\*<\/span>\s*<\/label>/,
  `<div className="flex items-center gap-2 mb-2">
                    <label className="block text-sm font-medium text-zinc-300">
                      Finalidad <span className="text-red-500">*</span>
                    </label>
                    <HelpText text="Describe qué quieres conseguir con este proyecto. El agente IA usará esta información para entender el contexto." />
                  </div>`
);

content = content.replace(
  /<label className="block text-sm font-medium text-zinc-300 mb-2">\s*Stack tecnológico\s*<\/label>/,
  `<div className="flex items-center gap-2 mb-2">
                    <label className="block text-sm font-medium text-zinc-300">
                      Stack tecnológico
                    </label>
                    <HelpText text="Opcional. Si el proyecto tiene un stack técnico, indicarlo ayuda al agente a generar documentación más precisa." />
                  </div>`
);

fs.writeFileSync(path, content);
