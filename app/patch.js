const fs = require('fs');
const path = 'src/app/api/projects/[id]/sources/route.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /const sourceId = uuidv4\(\);\s*const ext = path\.extname\(file\.name\);\s*const fileName = `\$\{sourceId\}\$\{ext\}`;\s*const filePath = path\.join\(sourcesDir, fileName\);\s*fs\.writeFileSync\(filePath, buffer\);\s*const meta = \{\s*originalName: file\.name,\s*size: file\.size,\s*mimeType: file\.type,\s*date: new Date\(\)\.toISOString\(\),\s*hash\s*\};\s*fs\.writeFileSync\(path\.join\(sourcesDir, `\$\{sourceId\}\.meta\.json`\), JSON\.stringify\(meta, null, 2\)\);\s*const stmt = db\.prepare\(`\s*INSERT INTO sources \(id, project_id, type, name, file_path, file_type, file_size, status, order_index\)\s*VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?\)\s*`\);\s*stmt\.run\(sourceId, projectId, 'file', file\.name, filePath, file\.type, file\.size, 'ready', nextOrderIndex\);/g,
  `const sourceId = uuidv4();
      
      // Handle relative paths for folder uploads
      const relativePath = formData.get('relativePath') as string || file.name;
      const ext = path.extname(relativePath);
      // Keep the directory structure but use uuid for the filename to avoid collisions
      const dirName = path.dirname(relativePath);
      const fileName = dirName !== '.' ? path.join(dirName, \`\${sourceId}\${ext}\`) : \`\${sourceId}\${ext}\`;
      const filePath = path.join(sourcesDir, fileName);

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, buffer);

      const meta = {
        originalName: relativePath,
        size: file.size,
        mimeType: file.type,
        date: new Date().toISOString(),
        hash
      };

      fs.writeFileSync(path.join(sourcesDir, \`\${sourceId}.meta.json\`), JSON.stringify(meta, null, 2));

      const stmt = db.prepare(\`
        INSERT INTO sources (id, project_id, type, name, file_path, file_type, file_size, status, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      \`);

      stmt.run(sourceId, projectId, 'file', relativePath, filePath, file.type, file.size, 'ready', nextOrderIndex);`
);

fs.writeFileSync(path, content);
