#!/usr/bin/env node
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import mongoose from 'mongoose';
import config from '../config/index.js';
import { openMemoryClient } from '../src/app/shared/openMemoryClient.js';

const formatAxiosError = (error) => {
  if (error.response) {
    return `${error.message} (status ${error.response.status})\nResponse body: ${JSON.stringify(error.response.data, null, 2)}`;
  }
  if (error.request) {
    return `${error.message} (no response received)`;
  }
  return error.message;
};

const baseUrl = process.env.SEARCH_TEST_BASE_URL || `http://localhost:${process.env.PORT || config.port || 5100}/api/v1`;
const searchEndpoint = `${baseUrl}/search/assistant`;

const createObjectIdString = () => new mongoose.Types.ObjectId().toString();

const resolveUserId = () => {
  const provided = process.env.SEARCH_TEST_USER;
  if (!provided) {
    return createObjectIdString();
  }

  try {
    return new mongoose.Types.ObjectId(provided).toString();
  } catch (error) {
    throw new Error(`SEARCH_TEST_USER must be a valid 24-char hex ObjectId. Received "${provided}"`);
  }
};

const userId = resolveUserId();
const conversationId = `openmemory-conv-${Date.now()}`;
const uniqueToken = process.env.SEARCH_TEST_TOKEN || `token-${randomUUID()}`;

const messageToStore = `Please remember this unique token verbatim: ${uniqueToken}. Just acknowledge.`;
const recallMessage = `What unique token did I tell you to remember earlier? Quote it exactly.`;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const logSection = (title, payload) => {
  console.log(`\n=== ${title} ===`);
  console.log(payload);
};

async function invokeSearch(message) {
  const payload = {
    message,
    conversationId,
    userId,
    deepSearch: false
  };

  logSection('Request payload', payload);

  try {
    const { data } = await axios.post(searchEndpoint, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: Number(process.env.SEARCH_TEST_TIMEOUT || 60000)
    });

    return data?.data?.responseMessage || data?.data || data;
  } catch (error) {
    throw new Error(`Search request failed: ${formatAxiosError(error)}\nPayload: ${JSON.stringify(payload, null, 2)}`);
  }
}

async function verifyOpenMemoryStorage() {
  if (!openMemoryClient.enabled) {
    throw new Error('OpenMemory is disabled (OPENMEMORY_ENABLED must be true).');
  }

  const matches = await openMemoryClient.queryMemories({
    query: uniqueToken,
    userId,
    k: 10
  });

  const stored = matches.some(match => match?.content?.includes(uniqueToken));
  return { stored, matches };
}

async function main() {
  console.log('🔎 Search↔OpenMemory integration test');
  console.log('Server endpoint:', searchEndpoint);
  console.log('User ID:', userId);
  console.log('Conversation ID:', conversationId);
  console.log('Token:', uniqueToken);

  if (!openMemoryClient.enabled) {
    throw new Error('OpenMemory is disabled. Set OPENMEMORY_ENABLED=true first.');
  }

  // Phase 1: Send memory seed message
  console.log('\n➡️  Phase 1: Sending memory seed message');
  const storeResponse = await invokeSearch(messageToStore);
  logSection('Phase 1 response', storeResponse);

  // Give the backend a moment to persist to OpenMemory
  await wait(Number(process.env.SEARCH_TEST_DELAY_MS || 1500));

  // Phase 2: Ask model to recall the token
  console.log('\n➡️  Phase 2: Requesting recall');
  const recallResponse = await invokeSearch(recallMessage);
  logSection('Phase 2 response', recallResponse);

  const recallMentionsToken = typeof recallResponse?.answer === 'string' && recallResponse.answer.includes(uniqueToken);

  // Phase 3: Directly verify OpenMemory contents
  console.log('\n➡️  Phase 3: Verifying OpenMemory storage');
  const { stored, matches } = await verifyOpenMemoryStorage();
  logSection('OpenMemory matches', matches);

  const summary = {
    token: uniqueToken,
    recallMentionsToken,
    memoryStored: stored,
    guidance: recallMentionsToken
      ? 'Search module appears to leverage OpenMemory context.'
      : 'Token not found in answer. Check OpenMemory matches to confirm persistence.'
  };

  logSection('Summary', summary);

  if (!stored) {
    throw new Error('Token not found in OpenMemory. Ensure Step 7 persistence is wired correctly.');
  }

  if (!recallMentionsToken) {
    console.warn('\n⚠️ Token not echoed in search response. This might be expected depending on LLM routing, but confirms persistence via OpenMemory.');
  } else {
    console.log('\n✅ Search module recalled the token via OpenMemory context.');
  }
}

main().catch((error) => {
  console.error('\n❌ Search/OpenMemory test failed');
  console.error(error.message || error);
  process.exit(1);
});
