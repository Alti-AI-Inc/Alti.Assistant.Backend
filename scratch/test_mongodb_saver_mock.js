import { StateGraph, END, START } from '@langchain/langgraph';
import { MongoDBSaver } from '../src/app/modules/workflow_automation/langgraph/mongodbSaver.js';
import WorkflowCheckpoint from '../src/app/modules/workflow_automation/models/workflowCheckpoint.model.js';

// ── In-Memory Database Mocking ──────────────────────────────────────────────
const dbMock = [];

console.log('🔬 Setting up Mongoose Model Mocking for WorkflowCheckpoint...');

WorkflowCheckpoint.findOne = async function (query) {
  console.log('   [DB Mock] findOne query:', JSON.stringify(query));
  const { threadId, checkpointId } = query;
  if (checkpointId) {
    return dbMock.find(
      (d) => d.threadId === threadId && d.checkpointId === checkpointId
    );
  } else {
    // Return latest checkpoint (sorted by checkpointId descending)
    const threadDocs = dbMock.filter((d) => d.threadId === threadId);
    threadDocs.sort((a, b) => b.checkpointId.localeCompare(a.checkpointId));
    return threadDocs[0];
  }
};

WorkflowCheckpoint.updateOne = async function (filter, update, options) {
  console.log('   [DB Mock] updateOne filter:', JSON.stringify(filter), 'update fields:', Object.keys(update.$set));
  const { threadId, checkpointId } = filter;
  const existing = dbMock.find(
    (d) => d.threadId === threadId && d.checkpointId === checkpointId
  );
  if (existing) {
    existing.checkpointStr = update.$set.checkpointStr;
    existing.metadataStr = update.$set.metadataStr;
  } else {
    dbMock.push({
      threadId,
      checkpointId,
      checkpointStr: update.$set.checkpointStr,
      metadataStr: update.$set.metadataStr,
    });
  }
  return { acknowledged: true };
};

WorkflowCheckpoint.find = function (query) {
  console.log('   [DB Mock] find query:', JSON.stringify(query));
  const { threadId } = query;
  let results = dbMock.filter((d) => d.threadId === threadId);

  if (query.checkpointId && query.checkpointId.$lt) {
    results = results.filter((d) => d.checkpointId < query.checkpointId.$lt);
  }

  const queryObj = {
    sort: function () {
      results.sort((a, b) => b.checkpointId.localeCompare(a.checkpointId));
      return this;
    },
    limit: function (lim) {
      results = results.slice(0, lim);
      return this;
    },
    exec: async function () {
      return results;
    },
    then: function (resolve, reject) {
      return this.exec().then(resolve, reject);
    }
  };
  return queryObj;
};

// ── Run Test Case ────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 Starting mock persistent checkpointer test...');

  const checkpointer = new MongoDBSaver();

  // Simple state graph
  const stateChannels = {
    counter: {
      value: (x, y) => y ?? x,
      default: () => 0,
    },
  };

  const stepNode = (state) => {
    console.log('🤖 [LangGraph Node] Processing. Current counter:', state.counter);
    return { counter: state.counter + 1 };
  };

  const graph = new StateGraph({ channels: stateChannels })
    .addNode('step', stepNode)
    .addEdge(START, 'step')
    .addEdge('step', END)
    .compile({ checkpointer });

  const runConfig = {
    configurable: {
      thread_id: 'test-thread-123',
    },
  };

  console.log('\n🚀 Step 1: Invoking graph...');
  let result = await graph.invoke({ counter: 10 }, runConfig);
  console.log('   Result counter:', result.counter);

  console.log('\n🚀 Step 2: Verifying mock database state...');
  console.log('   Total checkpoints in Mock DB:', dbMock.length);
  dbMock.forEach((doc, i) => {
    console.log(`   [${i + 1}] threadId: ${doc.threadId} | checkpointId: ${doc.checkpointId}`);
  });

  if (dbMock.length > 0) {
    console.log('   ✅ Checkpointer successfully wrote to database mockup!');
  } else {
    throw new Error('❌ Checkpoint was not written to database mockup.');
  }

  console.log('\n🚀 Step 3: Getting state from checkpointer...');
  const currentState = await graph.getState(runConfig);
  console.log('   Fetched state counter:', currentState.values.counter);

  if (currentState.values.counter === 11) {
    console.log('   ✅ Checkpointer successfully read state from database mockup!');
  } else {
    throw new Error(`❌ Fetched incorrect counter value: ${currentState.values.counter}`);
  }

  console.log('\n🎉 ALL PERSISTENT CHECKPOINTER TESTS COMPLETED & VERIFIED SUCCESSFULLY!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
