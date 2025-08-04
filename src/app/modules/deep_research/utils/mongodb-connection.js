import mongoose from 'mongoose';

let isConnected = false;
let currentUri = null;

export const connectToMongoDB = async (uri = 'mongodb://localhost:27017/research_agent') => {
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
        
        const connection = await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
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

export const getMongoDBConnection = () => {
    if (!isConnected) {
        throw new Error('MongoDB is not connected. Call connectToMongoDB() first.');
    }
    return mongoose.connection;
};

export const disconnectFromMongoDB = async () => {
    if (isConnected) {
        await mongoose.disconnect();
        isConnected = false;
        currentUri = null;
        console.log('MongoDB disconnected');
    }
};
