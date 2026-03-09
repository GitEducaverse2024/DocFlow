const fs = require('fs');
const path = 'src/app/projects/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add ChatPanel import
content = content.replace(
  /import \{ RagPanel \} from '@\/components\/rag\/rag-panel';/,
  `import { RagPanel } from '@/components/rag/rag-panel';\nimport { ChatPanel } from '@/components/chat/chat-panel';`
);

// Add MessageCircle icon
content = content.replace(
  /Files, Cpu, Clock, Database/,
  `Files, Cpu, Clock, Database, MessageCircle`
);

// Add Chat tab trigger
content = content.replace(
  /<\/TabsList>/,
  `  <TabsTrigger
            value="chat"
            className="data-[state=active]:bg-violet-600 data-[state=active]:text-white rounded-md px-4 py-2 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            Chat
          </TabsTrigger>
        </TabsList>`
);

// Add Chat tab content
content = content.replace(
  /<\/TabsContent>\s*<\/div>\s*<\/Tabs>\s*<\/div>\s*\);\s*\}/,
  `</TabsContent>

          <TabsContent value="chat" className="m-0">
            <SectionInfo
              emoji="💬"
              title="Chat con tu documentación"
              description="Haz preguntas sobre tu proyecto y el bot experto te responderá basándose en la documentación indexada."
              tips={[
                "Las respuestas se basan únicamente en el contexto de tus fuentes",
                "Si la información no está en los documentos, el bot te lo dirá"
              ]}
            />
            <ChatPanel project={project} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}`
);

fs.writeFileSync(path, content);
