const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true, // A title is generally expected for a note for better data integrity.
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Assuming you have a User model
    required: true,
  },
}, {
  timestamps: true, // Automatically adds `createdAt` and `updatedAt` fields, managing their values.
                    // This is the recommended way to handle timestamps in Mongoose,
                    // making the manual `createdAt` and `updatedAt` definitions redundant and less error-prone.
});

const Notes = mongoose.model('Notes', noteSchema);

module.exports = Notes;