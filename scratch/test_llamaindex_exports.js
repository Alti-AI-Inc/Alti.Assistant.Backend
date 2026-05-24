import { createWorkflow, workflowEvent } from '@llamaindex/workflow-core';

// 1. Define events
const IngestionStartEvent = workflowEvent();
const DocumentParsedEvent = workflowEvent();
const IngestionCompleteEvent = workflowEvent();

// 2. Create the workflow
const workflow = createWorkflow();

// 3. Register handlers
workflow.handle([IngestionStartEvent], async (context, event) => {
  console.log('[Handler 1] Received IngestionStartEvent with:', event.data);
  const parsedText = event.data.text.toUpperCase();
  console.log('[Handler 1] Parsing complete, sending DocumentParsedEvent');
  context.sendEvent(DocumentParsedEvent.with({ parsedText }));
});

workflow.handle([DocumentParsedEvent], async (context, event) => {
  console.log('[Handler 2] Received DocumentParsedEvent with:', event.data);
  console.log('[Handler 2] Ingestion complete, returning IngestionCompleteEvent');
  return IngestionCompleteEvent.with({ success: true, result: event.data.parsedText });
});

// 4. Run the workflow context and wait for completion event
async function main() {
  const context = workflow.createContext();
  console.log('Sending start event...');
  context.sendEvent(IngestionStartEvent.with({ text: 'hello world from event workflow' }));
  
  console.log('Waiting for completion event...');
  const finalEvent = await context.stream.untilEvent(IngestionCompleteEvent);
  console.log('Final Event Data:', finalEvent.data);
}

main().catch(console.error);



