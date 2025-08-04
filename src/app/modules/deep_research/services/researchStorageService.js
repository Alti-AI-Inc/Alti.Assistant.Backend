import mongoose from 'mongoose';
import { connectToMongoDB } from '../utils/mongodb-connection.js';
import config from '../../../../../config/index.js';

// Ensure MongoDB connection using the config URI
connectToMongoDB(config.database_local).catch(console.error);

// Define the research result schema
const researchResultSchema = new mongoose.Schema({
    query: {
        type: String,
        required: true,
        index: true
    },
    answer: {
        type: String,
        required: true
    },
    classification: {
        type: String,
        enum: ['search', 'direct', 'deep_research'],
        required: true,
        index: true
    },
    sources: [{
        id: Number,
        title: String,
        url: String,
        snippet: String
    }],
    metadata: {
        queryType: String,
        processingTime: Number,
        timestamp: Date,
        confidence: Number,
        savedId: String,
        saveError: String
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    tags: [{
        type: String,
        index: true
    }],
    userId: {
        type: String,
        index: true
    },
    conversationId: {
        type: String,
        index: true
    }
}, {
    timestamps: true,
    collection: 'research_results'
});

// Add indexes for better query performance
researchResultSchema.index({ timestamp: -1 });
researchResultSchema.index({ classification: 1, timestamp: -1 });
researchResultSchema.index({ query: 'text', answer: 'text' });

// Create the model
const ResearchResult = mongoose.model('ResearchResult', researchResultSchema);

/**
 * Save a research result to MongoDB
 */
export const saveResearchResult = async (resultData) => {
    try {
        const researchResult = new ResearchResult(resultData);
        const savedResult = await researchResult.save();
        console.log('Research result saved successfully:', savedResult._id);
        return savedResult;
    } catch (error) {
        console.error('Error saving research result:', error);
        throw error;
    }
};

/**
 * Retrieve research results by query
 */
export const getResearchResultsByQuery = async (query, limit = 10) => {
    try {
        const results = await ResearchResult
            .find({
                $text: { $search: query }
            })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
        
        return results;
    } catch (error) {
        console.error('Error retrieving research results by query:', error);
        throw error;
    }
};

/**
 * Retrieve recent research results
 */
export const getRecentResearchResults = async (limit = 20) => {
    try {
        const results = await ResearchResult
            .find({})
            .sort({ timestamp: -1 })
            .limit(limit)
            .select('query classification timestamp metadata.processingTime')
            .lean();
        
        return results;
    } catch (error) {
        console.error('Error retrieving recent research results:', error);
        throw error;
    }
};

/**
 * Get research result by ID
 */
export const getResearchResultById = async (id) => {
    try {
        const result = await ResearchResult.findById(id).lean();
        return result;
    } catch (error) {
        console.error('Error retrieving research result by ID:', error);
        throw error;
    }
};

/**
 * Get research results by conversation ID
 */
export const getResearchResultsByConversation = async (conversationId) => {
    try {
        const results = await ResearchResult
            .find({ conversationId })
            .sort({ timestamp: 1 })
            .lean();
        
        return results;
    } catch (error) {
        console.error('Error retrieving research results by conversation:', error);
        throw error;
    }
};

/**
 * Delete research result by ID
 */
export const deleteResearchResult = async (id) => {
    try {
        const result = await ResearchResult.findByIdAndDelete(id);
        return result;
    } catch (error) {
        console.error('Error deleting research result:', error);
        throw error;
    }
};

/**
 * Get research statistics
 */
export const getResearchStatistics = async () => {
    try {
        const totalResults = await ResearchResult.countDocuments();
        const searchResults = await ResearchResult.countDocuments({ classification: 'search' });
        const directResults = await ResearchResult.countDocuments({ classification: 'direct' });
        
        const avgProcessingTime = await ResearchResult.aggregate([
            {
                $group: {
                    _id: null,
                    avgTime: { $avg: '$metadata.processingTime' }
                }
            }
        ]);

        const recentActivity = await ResearchResult.aggregate([
            {
                $match: {
                    timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: { $hour: '$timestamp' },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id': 1 }
            }
        ]);

        return {
            total: totalResults,
            searchBased: searchResults,
            directResponse: directResults,
            averageProcessingTime: avgProcessingTime[0]?.avgTime || 0,
            last24Hours: recentActivity
        };
    } catch (error) {
        console.error('Error getting research statistics:', error);
        throw error;
    }
};

/**
 * Add tags to a research result
 */
export const addTagsToResult = async (id, tags) => {
    try {
        const result = await ResearchResult.findByIdAndUpdate(
            id,
            { $addToSet: { tags: { $each: tags } } },
            { new: true }
        );
        return result;
    } catch (error) {
        console.error('Error adding tags to research result:', error);
        throw error;
    }
};

/**
 * Search research results with filters
 */
export const searchResearchResults = async (filters = {}) => {
    try {
        const {
            query,
            classification,
            startDate,
            endDate,
            tags,
            userId,
            limit = 20,
            offset = 0
        } = filters;

        const mongoQuery = {};

        if (query) {
            mongoQuery.$text = { $search: query };
        }

        if (classification) {
            mongoQuery.classification = classification;
        }

        if (startDate || endDate) {
            mongoQuery.timestamp = {};
            if (startDate) mongoQuery.timestamp.$gte = new Date(startDate);
            if (endDate) mongoQuery.timestamp.$lte = new Date(endDate);
        }

        if (tags && tags.length > 0) {
            mongoQuery.tags = { $in: tags };
        }

        if (userId) {
            mongoQuery.userId = userId;
        }

        const results = await ResearchResult
            .find(mongoQuery)
            .sort({ timestamp: -1 })
            .skip(offset)
            .limit(limit)
            .lean();

        const total = await ResearchResult.countDocuments(mongoQuery);

        return {
            results,
            total,
            limit,
            offset,
            hasMore: total > offset + limit
        };
    } catch (error) {
        console.error('Error searching research results:', error);
        throw error;
    }
};

export { ResearchResult };
