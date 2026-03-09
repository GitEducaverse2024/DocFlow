const fs = require('fs');
const path = 'src/lib/types.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /rag_collection: string \| null;/,
  `rag_collection: string | null;\n  bot_created?: number;\n  bot_agent_id?: string | null;`
);

fs.writeFileSync(path, content);
