import * as langgraph from '@langchain/langgraph';
import { BaseCheckpointSaver } from '@langchain/langgraph';

console.log('langgraph exports:', Object.keys(langgraph));
console.log('BaseCheckpointSaver is:', BaseCheckpointSaver ? 'Defined' : 'Undefined');
