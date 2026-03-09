const fs = require('fs');
const path = 'src/app/projects/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add SectionInfo import
content = content.replace(
  /import \{ HelpText \} from '@\/components\/ui\/help-text';/,
  `import { HelpText } from '@/components/ui/help-text';\nimport { SectionInfo } from '@/components/ui/section-info';`
);

// Replace HelpText in TabsContent with SectionInfo
content = content.replace(
  /<TabsContent value="sources" className="m-0">\s*<div className="mb-6">\s*<HelpText text="Gestiona las fuentes de tu proyecto\. El orden determina la secuencia en que el agente procesará la documentación\." \/>\s*<\/div>/,
  `<TabsContent value="sources" className="m-0">
            <SectionInfo
              emoji="📂"
              title="Fuentes del proyecto"
              description="Sube y organiza toda la documentación que quieres que el agente IA analice. Puedes mezclar archivos, URLs, vídeos de YouTube y notas manuales. El orden determina la secuencia de procesamiento."
              tips={[
                "Arrastra carpetas completas para subir múltiples archivos",
                "Reordena las fuentes arrastrándolas por el icono ⠿",
                "Máximo 50MB por archivo, 500MB por proyecto"
              ]}
            />`
);

content = content.replace(
  /<TabsContent value="process" className="m-0">\s*<div className="mb-6">\s*<HelpText text="Selecciona las fuentes a incluir y lanza el procesamiento\. El agente generará un documento estructurado a partir de la documentación seleccionada\." \/>\s*<\/div>/,
  `<TabsContent value="process" className="m-0">
            <SectionInfo
              emoji="🤖"
              title="Procesamiento con IA"
              description="Selecciona las fuentes que quieres incluir y lanza el procesamiento. El agente IA leerá toda la documentación y generará un documento estructurado y unificado."
              tips={[
                "Puedes deseleccionar fuentes que no quieras incluir en esta iteración",
                "Cada procesamiento crea una nueva versión sin borrar las anteriores",
                "Añade instrucciones adicionales para guiar al agente"
              ]}
            />`
);

content = content.replace(
  /<TabsContent value="history" className="m-0">\s*<div className="mb-6">\s*<HelpText text="Historial de todas las versiones generadas\. Cada procesamiento crea una nueva versión sin borrar las anteriores\." \/>\s*<\/div>/,
  `<TabsContent value="history" className="m-0">
            <SectionInfo
              emoji="📜"
              title="Historial de versiones"
              description="Cada vez que procesas las fuentes se genera una nueva versión del documento. Aquí puedes ver, descargar y comparar todas las versiones generadas."
              tips={[
                "Haz clic en una versión para ver el documento completo",
                "Puedes cambiar de agente entre versiones para obtener perspectivas diferentes"
              ]}
            />`
);

content = content.replace(
  /<TabsContent value="rag" className="m-0">\s*<div className="mb-6">\s*<HelpText text="Indexa tus documentos procesados en una base vectorial para consulta inteligente vía MCP\." \/>\s*<\/div>/,
  `<TabsContent value="rag" className="m-0">
            <SectionInfo
              emoji="🧠"
              title="Base de conocimiento (RAG)"
              description="Indexa los documentos procesados en una base vectorial inteligente. Una vez indexados, podrás hacer preguntas sobre tu documentación y obtener respuestas precisas basadas en el contenido real."
              tips={[
                "Primero necesitas procesar las fuentes para generar un documento",
                "El RAG divide el documento en fragmentos y genera embeddings",
                "Puedes probar consultas directamente desde esta pestaña"
              ]}
            />`
);

fs.writeFileSync(path, content);
