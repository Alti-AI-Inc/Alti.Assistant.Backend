import mongoose from 'mongoose';

/**
 * @type {boolean}
 * @description Flag indicating whether a MongoDB connection is currently active.
 */
let isConnected = false;
/**
 * @type {string | null}
 * @description Stores the URI of the currently active MongoDB connection.
 */
let currentUri = null;

/**
 * Establishes a connection to MongoDB using Mongoose.
 * If already connected to the same URI, it returns the existing connection.
 * If connected to a different URI, it disconnects first before establishing a new connection.
 * It also sets up event listeners for connection errors, disconnections, and reconnections.
 *
 * @param {string} [uri='mongodb://localhost:27017/research_agent'] - The MongoDB connection URI.
 *   Defaults to 'mongodb://localhost:27017/research_agent'.
 * @returns {Promise<mongoose.Connection>} A promise that resolves to the Mongoose connection object.
 * @throws {Error} If there is an error connecting to MongoDB.
 */
export const connectToMongoDB = async (
  uri = 'mongodb://localhost:27017/research_agent'
) => {
  // If already connected to the same URI, return existing connection
  if (isConnected && currentUri === uri) {
    return mongoose.connection;
  }

  // If connected to a different URI, disconnect first
  if (isConnected && currentUri !== uri) {
    console.log('Disconnecting from previous MongoDB connection...');
    await mongoose.disconnect();
    isConnected = false;
    currentUri = null;
  }

  try {
    console.log('Connecting to MongoDB for research agent...');

    // Mongoose 6+ defaults to useNewUrlParser and useUnifiedTopology,
    // so these options are no longer necessary and can be removed.
    const connection = await mongoose.connect(uri, {
      family: 4,
    });

    isConnected = true;
    currentUri = uri;
    console.log('MongoDB connected successfully for research agent');

    // Handle connection events
    mongoose.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
      isConnected = false;
      currentUri = null;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      isConnected = false;
      currentUri = null;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
      isConnected = true;
    });

    return connection;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    isConnected = false;
    currentUri = null;
    throw error;
  }
};

/**
 * Retrieves the active Mongoose connection object.
 *
 * @returns {mongoose.Connection} The active Mongoose connection object.
 * @throws {Error} If MongoDB is not connected. Call `connectToMongoDB()` first.
 */
export const getMongoDBConnection = () => {
  if (!isConnected) {
    throw new Error('MongoDB is not connected. Call connectToMongoDB() first.');
  }
  return mongoose.connection;
};

/**
 * Disconnects from the active MongoDB connection if one exists.
 *
 * @returns {Promise<void>} A promise that resolves when the disconnection is complete.
 */
export const disconnectFromMongoDB = async () => {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    currentUri = null;
    console.log('MongoDB disconnected');
  }
};