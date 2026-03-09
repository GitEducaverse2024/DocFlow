const fs = require('fs');
const path = 'src/app/projects/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add icons import
content = content.replace(
  /import \{ Loader2, Settings, Trash2, ChevronRight \} from 'lucide-react';/,
  `import { Loader2, Settings, Trash2, ChevronRight, Files, Cpu, Clock, Database } from 'lucide-react';`
);

// Add state for counts
content = content.replace(
  /const \[refreshTrigger, setRefreshTrigger\] = useState\(0\);/,
  `const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sourcesCount, setSourcesCount] = useState(0);
  const [versionsCount, setVersionsCount] = useState(0);`
);

// Fetch counts
content = content.replace(
  /const data = await res\.json\(\);\s*setProject\(data\);/,
  `const data = await res.json();
        setProject(data);
        
        // Fetch counts
        try {
          const [sourcesRes, historyRes] = await Promise.all([
            fetch(\`/api/projects/\${params.id}/sources\`),
            fetch(\`/api/projects/\${params.id}/process/history\`)
          ]);
          
          if (sourcesRes.ok) {
            const sourcesData = await sourcesRes.json();
            setSourcesCount(sourcesData.length);
          }
          
          if (historyRes.ok) {
            const historyData = await historyRes.json();
            setVersionsCount(historyData.length);
          }
        } catch (e) {
          console.error('Error fetching counts', e);
        }`
);

// Replace TabsList
content = content.replace(
  /<TabsList className="bg-zinc-900 border-zinc-800 w-full justify-start rounded-none border-b p-0 h-auto">[\s\S]*?<\/TabsList>/,
  `<TabsList className="w-full justify-start bg-zinc-900 border border-zinc-800 rounded-lg p-1 gap-1 h-auto">
          <TabsTrigger
            value="sources"
            className="data-[state=active]:bg-violet-600 data-[state=active]:text-white rounded-md px-4 py-2 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2"
          >
            <Files className="w-4 h-4" />
            Fuentes
            <Badge variant="secondary" className="ml-1 text-xs bg-zinc-800 text-zinc-300 border-0">{sourcesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger
            value="process"
            className="data-[state=active]:bg-violet-600 data-[state=active]:text-white rounded-md px-4 py-2 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2"
          >
            <Cpu className="w-4 h-4" />
            Procesar
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="data-[state=active]:bg-violet-600 data-[state=active]:text-white rounded-md px-4 py-2 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2"
          >
            <Clock className="w-4 h-4" />
            Historial
            <Badge variant="secondary" className="ml-1 text-xs bg-zinc-800 text-zinc-300 border-0">{versionsCount}</Badge>
          </TabsTrigger>
          <TabsTrigger
            value="rag"
            className="data-[state=active]:bg-violet-600 data-[state=active]:text-white rounded-md px-4 py-2 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2"
          >
            <Database className="w-4 h-4" />
            RAG
            {(project?.rag_enabled === 1 || project?.status === 'rag_indexed') && <span className="w-2 h-2 bg-emerald-500 rounded-full ml-1" />}
          </TabsTrigger>
        </TabsList>`
);

fs.writeFileSync(path, content);
