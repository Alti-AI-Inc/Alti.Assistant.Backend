import dotenv from 'dotenv';
import path from 'path';
import { Composio } from '@composio/core';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const apiKey = process.env.COMPOSIO_API_KEY;
console.log('Using COMPOSIO_API_KEY:', apiKey);

const composio = new Composio({ apiKey });

async function run() {
  try {
    const url = await composio.connectedAccounts.initiate('test_user_id', 'github');
    console.log('SUCCESS:', url);
  } catch (err) {
    console.error('ERROR OCCURRED:', err);
  }
}

run();
