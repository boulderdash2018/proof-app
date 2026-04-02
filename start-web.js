const path = require('path');
const { spawn } = require('child_process');

const port = process.env.PORT || 8081;
const expoCli = path.join(__dirname, 'node_modules', '@expo', 'cli', 'build', 'bin', 'cli');

const child = spawn(process.execPath, [expoCli, 'start', '--web', '--port', String(port)], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port) },
  cwd: __dirname,
});

child.on('exit', (code) => process.exit(code || 0));
