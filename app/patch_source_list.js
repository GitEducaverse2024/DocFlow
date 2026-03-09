const fs = require('fs');
const path = 'src/components/sources/source-list.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add Checkbox import
content = content.replace(
  /import \{ Input \} from '@\/components\/ui\/input';/,
  `import { Input } from '@/components/ui/input';\nimport { Checkbox } from '@/components/ui/checkbox';\nimport { Button } from '@/components/ui/button';`
);

// Add state for selection
content = content.replace(
  /const \[typeFilter, setTypeFilter\] = useState\('all'\);/,
  `const [typeFilter, setTypeFilter] = useState('all');\n  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());\n  const [isDeletingMultiple, setIsDeletingMultiple] = useState(false);`
);

// Add handleSelectAll and handleDeleteSelected
content = content.replace(
  /const handleDelete = async \(id: string\) => \{/,
  `const handleSelectAll = () => {
    if (selectedIds.size === filteredSources.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSources.map(s => s.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(\`¿Estás seguro de eliminar \${selectedIds.size} fuentes?\`)) return;

    setIsDeletingMultiple(true);
    let successCount = 0;
    let errorCount = 0;

    for (const id of Array.from(selectedIds)) {
      try {
        const res = await fetch(\`/api/projects/\${projectId}/sources/\${id}\`, {
          method: 'DELETE',
        });
        if (res.ok) successCount++;
        else errorCount++;
      } catch (error) {
        errorCount++;
      }
    }

    if (successCount > 0) {
      setSources(sources.filter(s => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
      toast.success(\`\${successCount} fuentes eliminadas\`);
    }
    if (errorCount > 0) {
      toast.error(\`Error al eliminar \${errorCount} fuentes\`);
    }
    setIsDeletingMultiple(false);
  };

  const handleDelete = async (id: string) => {`
);

// Add selection UI
content = content.replace(
  /<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">/,
  `<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">`
);

content = content.replace(
  /<div className="text-sm text-zinc-400">\s*\{stats\.total\} fuentes añadidas \(\{stats\.file\} archivos, \{stats\.url\} URLs, \{stats\.youtube\} YouTube, \{stats\.note\} notas\)\s*<\/div>/,
  `<div className="flex flex-col gap-2">
          <div className="text-sm text-zinc-400">
            {stats.total} fuentes añadidas ({stats.file} archivos, {stats.url} URLs, {stats.youtube} YouTube, {stats.note} notas)
          </div>
          {filteredSources.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="select-all" 
                  checked={selectedIds.size === filteredSources.length && filteredSources.length > 0}
                  onCheckedChange={handleSelectAll}
                  className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                />
                <label htmlFor="select-all" className="text-sm text-zinc-300 cursor-pointer">
                  Seleccionar todo
                </label>
              </div>
              {selectedIds.size > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleDeleteSelected}
                  disabled={isDeletingMultiple}
                  className="h-7 text-xs bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0"
                >
                  {isDeletingMultiple ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Eliminar ({selectedIds.size})
                </Button>
              )}
            </div>
          )}
        </div>`
);

// Pass selection state to SourceItem
content = content.replace(
  /<SourceItem\s*key=\{source\.id\}\s*source=\{source\}\s*onDelete=\{handleDelete\}\s*onUpdate=\{handleUpdate\}\s*\/>/g,
  `<div key={source.id} className="flex items-center gap-3">
                <Checkbox 
                  checked={selectedIds.has(source.id)}
                  onCheckedChange={(checked) => {
                    const newSet = new Set(selectedIds);
                    if (checked) newSet.add(source.id);
                    else newSet.delete(source.id);
                    setSelectedIds(newSet);
                  }}
                  className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                />
                <div className="flex-1 min-w-0">
                  <SourceItem
                    source={source}
                    onDelete={handleDelete}
                    onUpdate={handleUpdate}
                  />
                </div>
              </div>`
);

fs.writeFileSync(path, content);
