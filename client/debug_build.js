import { exec } from 'child_process';
import fs from 'fs';

exec('npm run build', (error, stdout, stderr) => {
    const log = `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nERROR:\n${error}`;
    fs.writeFileSync('build_debug_node.log', log);
    console.log('Build finished. Check build_debug_node.log');
});
