const fs = require('fs');

function patchFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const [oldStr, newStr] of replacements) {
    content = content.replace(oldStr, newStr);
  }
  fs.writeFileSync(path, content);
}

patchFile('src/components/rag/rag-panel.tsx', [
  [/useState\(project\.name\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9\]\+\/g, '-'\)\)/g, "useState(project?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '')"]
]);

patchFile('src/components/process/version-history.tsx', [
  [/project\.name\.replace\(\/\\s\+\/g, '_'\)\.toLowerCase\(\)/g, "(project?.name || 'documento').replace(/\\s+/g, '_').toLowerCase()"]
]);

patchFile('src/components/process/process-panel.tsx', [
  [/project\.name\.replace\(\/\\s\+\/g, '_'\)\.toLowerCase\(\)/g, "(project?.name || 'documento').replace(/\\s+/g, '_').toLowerCase()"]
]);

patchFile('src/components/sources/source-list.tsx', [
  [/s\.name\.toLowerCase\(\)/g, "(s?.name || '').toLowerCase()"]
]);

patchFile('src/components/sources/source-item.tsx', [
  [/source\.name\.split/g, "(source?.name || '').split"],
  [/useState\(source\.name\)/g, "useState(source?.name || '')"],
  [/editName !== source\.name/g, "editName !== (source?.name || '')"],
  [/setEditName\(source\.name\)/g, "setEditName(source?.name || '')"],
  [/\{source\.name\}/g, "{source?.name || 'Sin nombre'}"]
]);

