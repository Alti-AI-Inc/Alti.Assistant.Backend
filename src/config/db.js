import mongoose from 'mongoose';

export const db = {
  isConnected: () => mongoose.connection.readyState === 1,
  disconnect: async () => {
    await mongoose.disconnect();
  }
};
