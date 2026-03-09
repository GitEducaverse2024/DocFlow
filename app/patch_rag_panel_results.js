const fs = require('fs');
const path = 'src/components/rag/rag-panel.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /\{results\.map\(\(result, idx\) => \([\s\S]*?<\/div>\s*\)\)\}/,
  `{results.map((result, idx) => (
                <div 
                  key={idx} 
                  className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg cursor-pointer hover:border-zinc-700 transition-colors"
                  onClick={() => setExpandedResult(expandedResult === idx ? null : idx)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-violet-500/10 text-violet-500 border-0 text-xs">
                        #{idx + 1}
                      </Badge>
                      <Badge variant="outline" className="bg-zinc-900 border-zinc-700 text-zinc-400 text-xs">
                        Chunk {result.payload?.chunk_index}
                      </Badge>
                    </div>
                    <span className="text-xs font-medium text-emerald-500">
                      Score: {(result.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className={\`text-sm text-zinc-300 \${expandedResult === idx ? '' : 'line-clamp-3'}\`}>
                    {result.payload?.text}
                  </p>
                </div>
              ))}`
);

fs.writeFileSync(path, content);
