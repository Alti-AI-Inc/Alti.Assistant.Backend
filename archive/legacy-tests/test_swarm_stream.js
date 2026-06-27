import fetch from 'node-fetch';

async function testSwarmStream() {
  try {
    console.log('Sending swarm stream request to local backend...');
    const response = await fetch('http://localhost:5100/api/v1/swarm/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Explain Javascript in one sentence.',
        conversationId: 'test-swarm-conv-' + Date.now(),
        requireSearch: false,
      }),
    });
    
    console.log('Response Status:', response.status);
    
    // Read SSE stream
    response.body.on('data', chunk => {
      console.log('Received chunk:', chunk.toString());
    });
    
    response.body.on('end', () => {
      console.log('Stream ended.');
    });
  } catch (error) {
    console.error('Request failed:', error);
  }
}

testSwarmStream();
