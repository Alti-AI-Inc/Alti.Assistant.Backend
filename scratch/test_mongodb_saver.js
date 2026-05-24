import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { StateGraph, END, START } from '@langchain/langgraph';
import config from '../config/index.js';
import { MongoDBSaver } from '../src/app/modules/workflow_automation/langgraph/mongodbSaver.js';
import WorkflowCheckpoint from '../src/app/modules/workflow_automation/models/workflowCheckpoint.model.js';

// Setup environment
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
  console.log('🔌 Connecting to MongoDB...');
  let connected = false;
  try {
    await mongoose.connect(config.database_local, { family: 4, serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to remote MongoDB.');
    connected = true;
  } catch (err) {
    console.warn('⚠️ Remote MongoDB connection failed:', err.message);
    console.log('🔌 Falling back to local MongoDB connection...');
    try {
      await mongoose.connect('mongodb://127.0.0.1:27017/Alti', { family: 4, serverSelectionTimeoutMS: 5000 });
      console.log('✅ Connected to local MongoDB.');
      connected = true;
    } catch (localErr) {
      console.error('❌ Local MongoDB connection also failed:', localErr.message);
    }
  }

  if (!connected) {
    throw new Error('Could not connect to any MongoDB instance.');
  }

  // Clear any existing test checkpoints
  await WorkflowCheckpoint.deleteMany({ threadId: 'test-thread-123' });

  // Instantiate our database checkpointer
  const checkpointer = new MongoDBSaver();

  // Define a simple state graph
  const stateChannels = {
    counter: {
      value: (x, y) => y ?? x,
      default: () => 0,
    }
  };

  const stepNode = (state) => {
    console.log('🤖 Step node processing. Current counter:', state.counter);
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
    }
  };

  console.log('\n🚀 First invocation...');
  let result = await graph.invoke({ counter: 10 }, runConfig);
  console.log('Result counter after first run:', result.counter);

  console.log('\n🔍 Verifying checkpoint exists in MongoDB...');
  const checkpointsInDb = await WorkflowCheckpoint.find({ threadId: 'test-thread-123' });
  console.log(`Found ${checkpointsInDb.length} checkpoints in DB.`);
  checkpointsInDb.forEach((doc, i) => {
    console.log(`   [${i + 1}] Checkpoint ID: ${doc.checkpointId}`);
  });

  if (checkpointsInDb.length > 0) {
    console.log('✅ Checkpointer successfully wrote to MongoDB!');
  } else {
    throw new Error('❌ Checkpoint was not found in database.');
  }

  console.log('\n🚀 Resuming/fetching state from checkpointer...');
  const currentState = await graph.getState(runConfig);
  console.log('Fetched state counter:', currentState.values.counter);

  if (currentState.values.counter === 11) {
    console.log('✅ Checkpointer successfully loaded state from MongoDB!');
  } else {
    throw new Error(`❌ Fetched incorrect counter value: ${currentState.values.counter}`);
  }

  // Cleanup
  await WorkflowCheckpoint.deleteMany({ threadId: 'test-thread-123' });
  await mongoose.disconnect();
  console.log('\n🎉 ALL PERSISTENT CHECKPOINTER TESTS PASSED!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
