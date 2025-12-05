const fs = require('fs');
const path = require('path');

try {
    const keyPath = path.join(__dirname, 'serviceAccountKey.json');
    console.log('Reading:', keyPath);
    const content = fs.readFileSync(keyPath, 'utf8');
    console.log('Length:', content.length);
    const json = JSON.parse(content);
    console.log('Project ID:', json.project_id);
    console.log('Parsed OK');
} catch (e) {
    console.error('FAIL:', e.message);
}
