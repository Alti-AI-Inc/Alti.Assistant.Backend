const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/app/modules/**/*.service.js');
let updatedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  if (content.includes('axios.create(') && !content.includes('withRetry')) {
    // Inject import after axios
    let lines = content.split('\n');
    let axiosLine = lines.findIndex(l => l.includes("import axios from 'axios'"));
    
    // Determine relative path depth
    const depth = file.split('/').length - 1;
    const prefix = '../'.repeat(depth - 1);
    
    if (axiosLine !== -1) {
      lines.splice(axiosLine + 1, 0, `import withRetry from '${prefix}shared/axiosRetry.js';`);
      content = lines.join('\n');
    }

    // Wrap axios.create(
    // It looks like:
    // const client = axios.create({ ...
    // or
    // clients[sport] = axios.create({ ...
    
    // Replace `axios.create(` with `withRetry(axios.create(`
    // We also need to add `)` at the end of the create block.
    // We can do this with a regex if we assume `});` or `})` closes it, but that's risky.
    // Simpler: Just do a string replace of `axios.create` -> `withRetry(axios.create`
    // and then manually add `)` at the closing `});`.
    
    const regex = /(axios\.create\(\{[\s\S]*?\})(;|$)/g;
    
    const serviceNameMatch = file.match(/([a-zA-Z0-9]+)\.service\.js/);
    const serviceName = serviceNameMatch ? serviceNameMatch[1] : 'UnknownService';

    content = content.replace(regex, (match, p1, p2) => {
      return `withRetry(${p1}, '${serviceName}')${p2}`;
    });

    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
    updatedCount++;
  }
}
console.log(`Finished updating ${updatedCount} files.`);
