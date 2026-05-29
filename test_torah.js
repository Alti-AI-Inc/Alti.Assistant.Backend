import { bibleService } from './src/app/modules/bible_knowledge/bible.service.js';

console.log('=== Testing Genesis 1:1 in BSB ===');
const bsb = bibleService.lookupPassage('GEN', 1, 1, 1, 'BSB');
console.log(bibleService.formatVerses(bsb, 'BSB'));

console.log('\n=== Testing Genesis 1:1 in JPS ===');
const jps = bibleService.lookupPassage('GEN', 1, 1, 1, 'JPS');
console.log(bibleService.formatVerses(jps, 'JPS'));

console.log('\n=== Testing Genesis 1:1 in HEBREW ===');
const heb = bibleService.lookupPassage('GEN', 1, 1, 1, 'HEBREW');
console.log(bibleService.formatVerses(heb, 'HEBREW'));

console.log('\n=== Testing Search in HEBREW (בראשית) ===');
const searchHeb = bibleService.search('בראשית', 2, 'HEBREW');
console.log(bibleService.formatVerses(searchHeb, 'HEBREW'));
