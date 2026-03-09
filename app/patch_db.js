const fs = require('fs');
const path = 'src/lib/db.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /export default db;/,
  `// Add new columns if they don't exist
try {
  db.exec('ALTER TABLE projects ADD COLUMN bot_created INTEGER DEFAULT 0');
} catch (e) {
  // Column might already exist
}

try {
  db.exec('ALTER TABLE projects ADD COLUMN bot_agent_id TEXT');
} catch (e) {
  // Column might already exist
}

export default db;`
);

fs.writeFileSync(path, content);
