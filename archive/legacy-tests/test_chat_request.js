import fetch from 'node-fetch';

async function testRequest() {
  try {
    console.log('Sending chat request to local backend...');
    const response = await fetch('http://localhost:5100/api/v1/orchestrator/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Hello, how are you?',
        conversationId: 'test-conversation-id',
      }),
    });
    
    console.log('Response Status:', response.status);
    const data = await response.json();
    console.log('Response Body:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Request failed:', error);
  }
}

testRequest();
