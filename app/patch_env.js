const fs = require('fs');

// Update .env.example
let envContent = fs.readFileSync('.env.example', 'utf8');
if (!envContent.includes('OPENCLAW_WORKSPACE_PATH')) {
  envContent += '\n# OpenClaw Workspace Path\nOPENCLAW_WORKSPACE_PATH=/home/deskmath/.openclaw\n';
  fs.writeFileSync('.env.example', envContent);
}

// Update docker-compose.yml
let dockerContent = fs.readFileSync('../docker-compose.yml', 'utf8');
if (!dockerContent.includes('~/.openclaw:/app/openclaw')) {
  dockerContent = dockerContent.replace(
    /- ~\/docflow-data:\/app\/data/,
    `- ~/docflow-data:/app/data\n      - ~/.openclaw:/app/openclaw`
  );
  fs.writeFileSync('../docker-compose.yml', dockerContent);
}
