import { wisdomService } from './src/app/modules/bible_knowledge/wisdom.service.js';

console.log('=== Testing Lookup ===');
const enoch = wisdomService.lookupPassage('Enoch', 1, 1);
console.log(wisdomService.formatVerses(enoch));

const imitation = wisdomService.lookupPassage('Imitation', 1, 1);
console.log(wisdomService.formatVerses(imitation));

console.log('\n=== Testing Search ===');
const search = wisdomService.search('light', 3);
console.log('Results:');
search.forEach(s => console.log(`- [${s.book} ${s.chapter}:${s.verse}] ${s.text}`));
