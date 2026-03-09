const fs = require('fs');
const path = 'src/components/sources/source-item.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add ExternalLink icon
content = content.replace(
  /Pencil, Trash2, Loader2, Check, X/,
  `Pencil, Trash2, Loader2, Check, X, ExternalLink`
);

// Add Textarea import
content = content.replace(
  /import \{ Input \} from '@\/components\/ui\/input';/,
  `import { Input } from '@/components/ui/input';\nimport { Textarea } from '@/components/ui/textarea';`
);

// Add state for note editing
content = content.replace(
  /const \[isDeleting, setIsDeleting\] = useState\(false\);/,
  `const [isDeleting, setIsDeleting] = useState(false);\n  const [isEditingNote, setIsEditingNote] = useState(false);\n  const [editNoteContent, setEditNoteContent] = useState(source.content_text || '');`
);

// Add handleSaveNote function
content = content.replace(
  /const handleSaveEdit = \(\) => \{/,
  `const handleSaveNote = () => {
    if (editNoteContent !== source.content_text) {
      onUpdate(source.id, { content_text: editNoteContent });
    }
    setIsEditingNote(false);
  };

  const handleSaveEdit = () => {`
);

// Update the name rendering to include links for URLs and YouTube
content = content.replace(
  /<span className="text-sm font-medium text-zinc-50 truncate cursor-default">\s*\{source\.name\}\s*<\/span>/,
  `{source.type === 'url' ? (
                  <a href={source.url || '#'} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-400 hover:text-blue-300 truncate flex items-center gap-1">
                    {source.name}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : source.type === 'youtube' ? (
                  <a href={source.url || \`https://youtube.com/watch?v=\${source.youtube_id}\`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-red-400 hover:text-red-300 truncate flex items-center gap-1">
                    {source.name}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-sm font-medium text-zinc-50 truncate cursor-default">
                    {source.name}
                  </span>
                )}`
);

// Add note edit button and textarea
content = content.replace(
  /\{!isEditing && \(\s*<Button\s*size="icon"\s*variant="ghost"\s*className="h-8 w-8 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"\s*onClick=\{.*?\}\s*>\s*<Pencil className="w-4 h-4" \/>\s*<\/Button>\s*\)\}/,
  `{!isEditing && !isEditingNote && (
            <>
              {source.type === 'note' && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
                  onClick={() => setIsEditingNote(true)}
                  title="Editar contenido"
                >
                  <FileText className="w-4 h-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
                onClick={() => setIsEditing(true)}
                title="Renombrar"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </>
          )}`
);

// Wrap the whole return in a div to allow expanding for note editing
content = content.replace(
  /return \(\s*<div\s*ref=\{setNodeRef\}\s*style=\{style\}\s*className=\{cn\(\s*"flex items-center gap-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg group hover:border-zinc-700 transition-colors",\s*isDragging && "opacity-50 border-violet-500 shadow-lg"\s*\)\}\s*>/,
  `return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg group hover:border-zinc-700 transition-colors",
        isDragging && "opacity-50 border-violet-500 shadow-lg"
      )}
    >
      <div className="flex items-center gap-4 p-3">`
);

content = content.replace(
  /<\/div>\s*\);\s*\}/,
  `</div>
      
      {isEditingNote && (
        <div className="p-3 pt-0 border-t border-zinc-800/50 mt-2">
          <Textarea
            value={editNoteContent}
            onChange={(e) => setEditNoteContent(e.target.value)}
            className="min-h-[100px] bg-zinc-950 border-zinc-800 text-zinc-50 mb-2 text-sm"
            placeholder="Contenido de la nota..."
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => {
              setEditNoteContent(source.content_text || '');
              setIsEditingNote(false);
            }}>
              Cancelar
            </Button>
            <Button size="sm" className="bg-violet-500 hover:bg-violet-400 text-white" onClick={handleSaveNote}>
              Guardar nota
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}`
);

fs.writeFileSync(path, content);
