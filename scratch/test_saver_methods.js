import { MemorySaver } from '@langchain/langgraph';

const saver = new MemorySaver();
console.log('MemorySaver methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(saver)));
console.log('MemorySaver superclass methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(Object.getPrototypeOf(saver))));
