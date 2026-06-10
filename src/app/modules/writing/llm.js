import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PredictionServiceClient } from '@google-cloud/aiplatform';
import config from '../../../../config/index.js';
import { PromptTemplate } from '@langchain/core/prompts';
import express from 'express';

export const llm = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: 'gemini-2.5-flash',
  temperature: 0.7,
});


export const isUserFinished = async (userResponse) => {
  if (!userResponse) return false;
  const prompt = PromptTemplate.fromTemplate(
    `Analyze the user's response to determine if they are finished providing details for the image.
        The user has been answering clarifying questions.
        If the user's message indicates they are done, satisfied, or want to proceed, respond with "YES".
        Examples of finished responses: "that's it", "I'm done", "go ahead and create it", "yes, that's all".
        If the user is providing more details or answering a question, respond with "NO".

        User response: "{response}"
        
        Your answer (must be YES or NO):`
  );
  const chain = prompt.pipe(llm);
  const result = await chain.invoke({ response: userResponse });
  return result.content.toUpperCase().includes('YES');
};

// --- GCP Cloud Run Server & Lifecycle Management ---

const app = express();
// Cloud Run provides the PORT environment variable to listen on.
const PORT = process.env.PORT || 8080;

// Liveness probe: A simple check to see if the server process is running and responsive.
// Cloud Run uses this to determine if the container needs to be restarted.
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

// Readiness probe: Checks if the application is ready to accept incoming traffic.
// Cloud Run will stop sending new requests to instances that fail this check.
// This is where you would add checks for database connections or other critical dependencies.
app.get('/readyz', (req, res) => {
  // For this service, we assume it's ready if the server is running.
  // In a real-world application, you might check:
  // - Database connection is alive
  // - Required external services are reachable
  // if (!database.isConnected()) {
  //   return res.status(503).send('not ready');
  // }
  res.status(200).send('ok');
});

// TODO: Add your application-specific routes here.
// For example:
// app.use(express.json());
// app.post('/api/is-user-finished', async (req, res) => {
//   const { userResponse } = req.body;
//   const result = await isUserFinished(userResponse);
//   res.json({ finished: result });
// });


const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

let isShuttingDown = false;

// Graceful shutdown logic for Cloud Run
const gracefulShutdown = () => {
  // Prevent multiple shutdown signals from running cleanup more than once
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('Received signal to terminate. Shutting down gracefully...');

  // 1. Stop accepting new connections. Existing connections will be allowed to finish.
  server.close((err) => {
    if (err) {
      console.error('Error during server shutdown:', err);
      process.exit(1);
    }

    console.log('HTTP server closed. No new connections will be accepted.');

    // 2. Close any other resources like database connections, message queues, etc.
    // Example: database.close().then(() => { ... });
    
    console.log('All resources cleaned up. Exiting process.');
    process.exit(0);
  });

  // 3. Cloud Run gives a 10-second grace period by default.
  // If connections don't close in time, force shutdown.
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down.');
    process.exit(1);
  }, 9500); // Set slightly less than the default 10s timeout
};

// Listen for SIGTERM signal (sent by Cloud Run when scaling down)
process.on('SIGTERM', gracefulShutdown);

// Listen for SIGINT signal (for local development, e.g., Ctrl+C)
process.on('SIGINT', gracefulShutdown);