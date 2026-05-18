import httpStatus from 'http-status';
import AiEndpoint from './aiEndpoint.Model.js';
import aiEndpoints from './aiEndpoint.utils.js';

const addAiEndpoint = async (req, res) => {
  try {
    const {
      id,
      title,
      nickName,
      enabled,
      default: isDefault,
      add,
      history,
      delete: deleteUrl,
    } = req.body;

    // Validate required fields
    if (!title || !add || !history || !deleteUrl || !nickName) {
      return res.status(400).json({
        status: 'fail',
        message: 'All fields (title, add, history, delete) are required.',
      });
    }

    // Check if the title already exists
    // const existingEndpoint = await AiEndpoint.findOne({ title });
    // if (existingEndpoint) {
    //   return res.status(400).json({
    //     status: 'fail',
    //     message: `AI endpoint '${title}' already exists.`,
    //   });
    // }

    // Check if the title or _id already exists
    const existingEndpoint = await AiEndpoint.findOne({
      $or: [
        { title }, // Check for matching title
        { _id: id }, // Check for matching _id
      ],
    });

    if (existingEndpoint) {
      return res.status(400).json({
        status: 'fail',
        message: `AI endpoint with ${existingEndpoint.title ? `'${existingEndpoint.title}'` : `'${existingEndpoint._id}'`} already exists.`,
      });
    }

    // Create and save the new endpoint
    const newEndpoint = await AiEndpoint.create({
      title,
      nickName,
      enabled: enabled || false,
      default: isDefault || false,
      add,
      history,
      delete: deleteUrl,
    });

    res.status(201).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: `AI endpoint '${title}' created successfully.`,
      data: newEndpoint,
    });
  } catch (error) {
    res.status(500).json({
      status: 'fail',
      message: 'Error creating AI endpoint',
      error: error.message,
    });
  }
};

// Get All AI Endpoints from Database
const getWebAiEndpoint = async (req, res) => {
  try {
    const aiEndpoints = await AiEndpoint.find(); // Fetch from DB
    res.status(200).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Fetched AI socket endpoints successfully',
      anonymously: '/groq/get-response-anonymously',
      data: aiEndpoints,
    });
  } catch (error) {
    res.status(500).json({
      status: 'fail',
      message: 'Error fetching AI endpoints',
      error: error.message,
    });
  }
};
const getAiEndpointForApp = async (req, res) => {
  try {
    res.status(200).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Get aiSocketEndpoint successfully',
      anonymously: '/groq/get-response-anonymously',
      data: aiEndpoints,
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: "Couldn't not get aiSocketEndpoint",
      error: error.message,
    });
  }
};

const updateWebAiEndpoint = async (req, res) => {
  try {
    const { title, enabled, default: isDefault } = req.body;

    if (!title) {
      return res.status(400).json({
        status: 'fail',
        message: 'Title is required to identify the AI endpoint.',
      });
    }

    // If isDefault is true, first set all other AI endpoints to false
    if (isDefault === true) {
      await AiEndpoint.updateMany({}, { default: false });
    }

    // Update the AI endpoint without modifying the title
    const updatedEndpoint = await AiEndpoint.findOneAndUpdate(
      { title }, // Find by title
      { enabled, default: isDefault }, // Only update enabled & default
      { new: true, runValidators: true }
    );

    if (!updatedEndpoint) {
      return res.status(404).json({
        status: 'fail',
        message: `AI endpoint '${title}' not found.`,
      });
    }

    res.status(200).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: `Updated AI endpoint '${title}' successfully.`,
      data: updatedEndpoint,
    });
  } catch (error) {
    res.status(500).json({
      status: 'fail',
      message: 'Error updating AI endpoint',
      error: error.message,
    });
  }
};

export const AiEndpointsController = {
  addAiEndpoint,
  getAiEndpointForApp,
  getWebAiEndpoint,
  updateWebAiEndpoint,
};
