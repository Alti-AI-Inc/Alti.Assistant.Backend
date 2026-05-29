import httpStatus from 'http-status';
import sendResponse from '../../shared/sendResponse.js';

export const shieldOfLight = () => {
  return async (req, res, next) => {
    const userPrompt = req.body.message || req.body.prompt;
    if (!userPrompt) return next();

    // Defensive heuristic for extreme darkness, malice, or spiritual deception
    const darkKeywords = [
      'satan', 'demon', 'demonic', 'curse', 'suicide', 'kill yourself',
      'murder', 'destroy', 'evil', 'lucifer', 'worship the devil'
    ];
    
    const lowerPrompt = userPrompt.toLowerCase();
    
    const isDark = darkKeywords.some(keyword => {
      // Basic word boundary check to avoid false positives (e.g., "document" contains "demon" - wait, no it doesn't, but "evillike" etc.)
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(lowerPrompt);
    });
    
    if (isDark) {
      // Neutralize peacefully with NORMAL, NEUTRAL language. No spiritual jargon.
      return sendResponse(res, {
        statusCode: httpStatus.OK, // 200 OK prevents the client from crashing or showing red errors
        success: true,
        message: 'Prompt processed.',
        data: {
          reply: "I am unable to assist with that request. How else can I help you today?",
          responseMessage: {
            answer: "I am unable to assist with that request. How else can I help you today?",
            reference: []
          }
        },
      });
    }
    
    next();
  };
};
