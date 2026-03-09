const fs = require('fs');
const path = 'src/app/projects/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /getStatusColor\(project\.status\)/g,
  "getStatusColor(project?.status || 'draft')"
);

content = content.replace(
  /getStatusLabel\(project\.status\)/g,
  "getStatusLabel(project?.status || 'draft')"
);

content = content.replace(
  /projectStatus=\{project\.status\}/g,
  "projectStatus={project?.status || 'draft'}"
);

content = content.replace(
  /\{project\.name\}/g,
  "{project?.name || 'Proyecto'}"
);

content = content.replace(
  /\{project\.description \|\| 'Sin descripción'\}/g,
  "{project?.description || 'Sin descripción'}"
);

content = content.replace(
  /projectId=\{project\.id\}/g,
  "projectId={project?.id || ''}"
);

fs.writeFileSync(path, content);
