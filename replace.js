const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('./src', (filePath) => {
  if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let replaced = content.replace(/Liberty Center One/gi, 'Aphura');
    if (content !== replaced) {
      fs.writeFileSync(filePath, replaced, 'utf8');
      console.log(`Replaced in ${filePath}`);
    }
  }
});
