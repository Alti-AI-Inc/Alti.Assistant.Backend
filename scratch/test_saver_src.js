import { MemorySaver } from '@langchain/langgraph';

const saver = new MemorySaver();
console.log('getTuple implementation:', saver.getTuple.toString());
console.log('put implementation:', saver.put.toString());
console.log('list implementation:', saver.list.toString());
