const fs = require('fs');
const db = fs.readFileSync('src/app/helpers/sportsIntentDB.js', 'utf8');
const idx = db.indexOf("kelce");
console.log('Context around kelce:');
console.log(JSON.stringify(db.substring(idx - 50, idx + 200)));
const idx2 = db.indexOf('rybakina');
console.log('\nContext around rybakina:');
if (idx2 > -1) console.log(JSON.stringify(db.substring(idx2 - 10, idx2 + 100)));
else console.log('NOT FOUND');
