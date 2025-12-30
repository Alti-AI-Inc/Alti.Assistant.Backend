import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import {
  LEGAL_CONTRACT_CONFIG,
  CONTRACT_TYPES,
  CONTRACT_INTENTS,
  SYSTEM_PROMPTS,
  RESPONSE_MESSAGES,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
  QUESTION_STATUS,
  OUTPUT_FORMATS,
} from './legal_contract.constant.js';
import fs from 'fs/promises';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import Conversation from '../conversations/conversation.model.js';
import { uploadContractToGCS } from './services/gcsUploadService.js';
import {
  generateContractFile as createContractFile,
  cleanupContractFile as removeContractFile,
} from './services/fileGenerationService.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Generate unique guest user ID
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generate unique conversation ID
 */
const generateConversationId = () => {
  return `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Extract text from uploaded file
 */
const extractTextFromFile = async (filePath, mimetype) => {
  try {
    let extractedText = '';

    if (mimetype === 'application/pdf') {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = new PDFParse({
        data: dataBuffer,
      });
      const textData = await pdfData.getText();
      extractedText = textData.pages.map(page => page.text).join('\n');
    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimetype === 'application/msword'
    ) {
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (mimetype === 'text/plain') {
      extractedText = await fs.readFile(filePath, 'utf-8');
    }

    return extractedText.trim();
  } catch (error) {
    logger.error('Error extracting text from file:', error);
    throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to extract text from file');
  }
};

/**
 * Cleanup temporary file
 */
const cleanupFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    logger.info(`Cleaned up file: ${filePath}`);
  } catch (error) {
    logger.warn(`Failed to cleanup file ${filePath}:`, error);
  }
};

/**
 * Detect if user wants to download the contract as a file using AI
 */
const detectDownloadIntent = async (userMessage) => {
  try {
    const model = genAI.getGenerativeModel({
      model: LEGAL_CONTRACT_CONFIG.MODEL,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 200,
      },
    });

    const prompt = `Analyze the user's message to determine if they want to download the contract as a file.

User Message: "${userMessage}"

Determine:
1. Does the user want a file? (yes/no)
2. What format? (txt, docx, pdf, or none)

Examples:
- "make it a file" -> yes, txt
- "give me a download link" -> yes, txt
- "can I download this?" -> yes, txt
- "export as docx" -> yes, docx
- "send me the pdf" -> yes, pdf
- "update the contract" -> no, none
- "add more details" -> no, none

Respond ONLY in this exact JSON format:
{
  "wantsFile": true or false,
  "format": "txt" or "docx" or "pdf" or "none"
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        wantsFile: parsed.wantsFile || false,
        format: parsed.format || 'txt',
      };
    }

    // Fallback: check for common keywords
    const message = userMessage.toLowerCase();
    const fileKeywords = ['file', 'download', 'export', 'save', 'link', 'pdf', 'docx', 'document'];
    const hasFileKeyword = fileKeywords.some(keyword => message.includes(keyword));

    let format = 'txt';
    if (message.includes('docx') || message.includes('word')) format = 'docx';
    if (message.includes('pdf')) format = 'pdf';

    return {
      wantsFile: hasFileKeyword,
      format: hasFileKeyword ? format : 'none',
    };
  } catch (error) {
    logger.error('Error detecting download intent:', error);
    // Fallback to keyword detection
    const message = userMessage.toLowerCase();
    const fileKeywords = ['file', 'download', 'export', 'save', 'link'];
    const wantsFile = fileKeywords.some(keyword => message.includes(keyword));
    return {
      wantsFile,
      format: wantsFile ? 'txt' : 'none',
    };
  }
};

/**
 * Generate contract file and upload to GCS
 */
const generateAndUploadContractFile = async (contractContent, userId, metadata = {}) => {
  try {
    const format = metadata.format || 'txt';

    // Generate local file
    const fileResult = await createContractFile(contractContent, format, {
      contractType: metadata.contractType || 'contract',
      userId,
    });

    // Upload to GCS
    const uploadResult = await uploadContractToGCS(fileResult.filePath, {
      userId,
      contractType: metadata.contractType || 'contract',
      conversationId: metadata.conversationId,
    });

    // Clean up local file after upload
    if (uploadResult.storageType === 'gcs') {
      await removeContractFile(fileResult.filePath);
    }

    logger.info('Contract file generated and uploaded successfully', {
      fileName: uploadResult.fileName,
      storageType: uploadResult.storageType,
    });

    return {
      success: true,
      fileName: uploadResult.fileName,
      publicUrl: uploadResult.publicUrl,
      downloadLink: uploadResult.publicUrl,
      storageType: uploadResult.storageType,
      format: fileResult.fileType,
      localPath: uploadResult.storageType === 'local' ? uploadResult.localPath : null,
    };
  } catch (error) {
    logger.error('Error generating and uploading contract file:', error);
    throw error;
  }
};

/**
 * Handle contract conversation (create or retrieve)
 */
const handleContractConversation = async (userId, conversationId, userMessage, isGuest = false) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, userId);
        logger.info(`Fetched conversation with ID: ${conversationId}`);
      } catch (error) {
        logger.warn(`Conversation ${conversationId} not found, creating new one`);
      }
    }

    if (!conversation) {
      const newConversationId = conversationId || generateConversationId();

      conversation = await conversationService.createConversation(
        {
          userId,
          title: `Legal Contract: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
          },
          contractMetadata: {
            contractParams: { ...DEFAULT_PARAMS },
            pendingQuestions: [],
            currentQuestionIndex: 0,
            uploadedFiles: [],
            contractGenerated: false,
            allQuestionsAnswered: false,
          },
        },
        newConversationId
      );

      logger.info(`Created new contract conversation ${newConversationId} for user ${userId}`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling contract conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle conversation');
  }
};

/**
 * Add message to conversation
 */
const addMessage = async (conversationId, userId, role, content, metadata = {}) => {
  try {
    const message = {
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    return await conversationService.addMessageToConversation(conversationId, userId, message);
  } catch (error) {
    logger.error('Error adding message to conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add message');
  }
};

/**
 * Store uploaded document in conversation
 */
const storeDocumentInConversation = async (conversationId, userId, fileInfo) => {
  try {
    const extractedText = await extractTextFromFile(fileInfo.path, fileInfo.mimetype);

    const documentData = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalName: fileInfo.originalname,
      filename: fileInfo.filename,
      path: fileInfo.path,
      extractedText:
        extractedText.length <= LEGAL_CONTRACT_CONFIG.MAX_CACHED_TEXT_SIZE
          ? extractedText
          : extractedText.substring(0, LEGAL_CONTRACT_CONFIG.MAX_CACHED_TEXT_SIZE),
      textLength: extractedText.length,
      textTruncated: extractedText.length > LEGAL_CONTRACT_CONFIG.MAX_CACHED_TEXT_SIZE,
      size: fileInfo.size,
      mimetype: fileInfo.mimetype,
      uploadedAt: new Date(),
    };

    await Conversation.updateOne(
      { conversationId },
      {
        $push: { 'contractMetadata.uploadedFiles': documentData },
        $set: { 'contractMetadata.currentDocumentId': documentData.id },
      }
    );

    logger.info('Document stored successfully', { documentId: documentData.id });

    // Cleanup temp file
    await cleanupFile(fileInfo.path);

    return documentData;
  } catch (error) {
    logger.error('Error storing document:', error);
    await cleanupFile(fileInfo.path);
    throw error;
  }
};

/**
 * Analyze user intent and identify contract type
 */
const analyzeContractType = async (userMessage, fileContext = null) => {
  try {
    const model = genAI.getGenerativeModel({
      model: LEGAL_CONTRACT_CONFIG.MODEL,
      generationConfig: {
        temperature: LEGAL_CONTRACT_CONFIG.TEMPERATURE,
        maxOutputTokens: 1024,
      },
    });

    const filePrompt = fileContext
      ? `\n\nUser uploaded document context:\n${fileContext.substring(0, 2000)}`
      : '';

    const prompt = `You are a legal contract analysis expert. Analyze the user's request and identify the contract type.

User Request: ${userMessage}
${filePrompt}

Available contract types: employment, nda, service_agreement, freelance, consulting, lease, partnership, sales, license, vendor, loan, independent_contractor, general

Return a JSON response with this format:
{
  "contractType": "identified_type",
  "summary": "Brief summary of what contract will be created",
  "extractedInfo": {
    "parties": "any party information mentioned",
    "terms": "any terms mentioned",
    "other": "any other relevant details"
  }
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        contractType: CONTRACT_TYPES.GENERAL,
        summary: '',
        extractedInfo: {},
      };
    }

    const aiResponse = JSON.parse(jsonMatch[0]);

    logger.info('Identified contract type:', {
      contractType: aiResponse.contractType,
    });

    return {
      contractType: aiResponse.contractType || CONTRACT_TYPES.GENERAL,
      summary: aiResponse.summary || '',
      extractedInfo: aiResponse.extractedInfo || {},
    };
  } catch (error) {
    logger.error('Error analyzing contract type:', error);
    return {
      contractType: CONTRACT_TYPES.GENERAL,
      summary: '',
      extractedInfo: {},
    };
  }
};

/**
 * Generate enhancement questions after contract is created
 */
const generateEnhancementQuestions = async (contractType, currentContract, conversationHistory) => {
  try {
    const model = genAI.getGenerativeModel({
      model: LEGAL_CONTRACT_CONFIG.MODEL,
      generationConfig: {
        temperature: LEGAL_CONTRACT_CONFIG.TEMPERATURE,
        maxOutputTokens: 1024,
      },
    });

    const prompt = `You are a legal contract expert. Review the generated contract and suggest ${LEGAL_CONTRACT_CONFIG.MIN_QUESTIONS} to ${LEGAL_CONTRACT_CONFIG.MAX_QUESTIONS} enhancement questions to improve it.

Contract Type: ${contractType}

Current Contract Preview:
${currentContract.substring(0, 1500)}

Previous conversation:
${conversationHistory.slice(-4).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Generate specific questions to enhance the contract. Focus on:
1. Missing important clauses or terms
2. Clarification of existing terms
3. Additional protections or provisions
4. Jurisdiction-specific requirements

Return JSON format:
{
  "questions": [
    {
      "id": "q1",
      "question": "Clear enhancement question?",
      "reason": "How this improves the contract",
      "type": "text"
    }
  ]
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return [];
    }

    const aiResponse = JSON.parse(jsonMatch[0]);
    return aiResponse.questions || [];
  } catch (error) {
    logger.error('Error generating enhancement questions:', error);
    return [];
  }
};

/**
 * Generate initial legal contract from user request
 */
const generateInitialContract = async (userMessage, contractType, fileContext = null, extractedInfo = {}) => {
  try {
    const systemPrompt = SYSTEM_PROMPTS[contractType] || SYSTEM_PROMPTS[CONTRACT_TYPES.GENERAL];

    const model = genAI.getGenerativeModel({
      model: LEGAL_CONTRACT_CONFIG.MODEL,
      generationConfig: {
        temperature: LEGAL_CONTRACT_CONFIG.TEMPERATURE,
        maxOutputTokens: LEGAL_CONTRACT_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const filePrompt = fileContext
      ? `\n\nReference Document Content:\n${fileContext}`
      : '';

    const extractedInfoPrompt = Object.keys(extractedInfo).length > 0
      ? `\n\nExtracted Information:\n${JSON.stringify(extractedInfo, null, 2)}`
      : '';

    const prompt = `${systemPrompt}

User Request: ${userMessage}
${filePrompt}
${extractedInfoPrompt}

Based on the user's request, generate a comprehensive professional legal contract. Use any information provided, and where information is missing, use reasonable placeholders like [PARTY NAME], [DATE], [AMOUNT], etc.

Include:
1. Title and parties identification
2. Recitals/Background (if appropriate)
3. Definitions (if needed)
4. Main terms and conditions organized in clear sections
5. Standard legal provisions (termination, dispute resolution, etc.)
6. Signature blocks

Format the contract professionally with proper numbering and structure.`;

    const result = await model.generateContent(prompt);
    const contractText = result.response.text();

    logger.info('Initial contract generated', {
      length: contractText.length,
      contractType,
    });

    return {
      success: true,
      contract: contractText,
      contractType,
      generatedAt: new Date(),
    };
  } catch (error) {
    logger.error('Error generating initial contract:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to generate contract');
  }
};

/**
 * Update contract based on user answer
 */
const updateContractWithAnswer = async (currentContract, question, answer, contractType) => {
  try {
    const model = genAI.getGenerativeModel({
      model: LEGAL_CONTRACT_CONFIG.MODEL,
      generationConfig: {
        temperature: LEGAL_CONTRACT_CONFIG.TEMPERATURE,
        maxOutputTokens: LEGAL_CONTRACT_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const prompt = `You are a legal contract expert. Update the following contract based on the user's answer to an enhancement question.

Contract Type: ${contractType}

Current Contract:
${currentContract}

Enhancement Question: ${question}
User's Answer: ${answer}

Update the contract by:
1. Incorporating the new information from the user's answer
2. Maintaining all existing clauses that aren't affected
3. Ensuring legal consistency and proper formatting
4. Making the enhancement seamless and professional

Return ONLY the updated contract text, no explanations.`;

    const result = await model.generateContent(prompt);
    const updatedContract = result.response.text().trim();

    return updatedContract;
  } catch (error) {
    logger.error('Error updating contract:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update contract');
  }
};

/**
 * Modify contract based on user's general modification request
 */
const modifyContractWithRequest = async (currentContract, modificationRequest, contractType) => {
  try {
    const model = genAI.getGenerativeModel({
      model: LEGAL_CONTRACT_CONFIG.MODEL,
      generationConfig: {
        temperature: LEGAL_CONTRACT_CONFIG.TEMPERATURE,
        maxOutputTokens: LEGAL_CONTRACT_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const prompt = `You are a legal contract expert. Modify the following contract based on the user's modification request.

Contract Type: ${contractType}

Current Contract:
${currentContract}

User's Modification Request: ${modificationRequest}

Instructions:
1. Understand what the user wants to add, change, or clarify
2. Update the contract accordingly with proper legal language
3. Add new clauses if needed (e.g., if user asks "what if employee misses attendance", add an attendance policy clause)
4. Maintain all existing clauses that aren't affected
5. Ensure legal consistency and professional formatting
6. Keep the contract structure organized

Return ONLY the updated contract text, no explanations or additional commentary.`;

    const result = await model.generateContent(prompt);
    const updatedContract = result.response.text().trim();

    logger.info('Contract modified successfully', {
      originalLength: currentContract.length,
      modifiedLength: updatedContract.length,
    });

    return updatedContract;
  } catch (error) {
    logger.error('Error modifying contract:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to modify contract');
  }
};

/**
 * Main conversational handler - NEW FLOW
 * 1. First message: Generate contract immediately
 * 2. Ask enhancement questions at the end
 * 3. Each answer: Update the contract and ask next question
 */
const processConversationalRequest = async (
  userId,
  userMessage,
  conversationId,
  fileInfo = null,
  outputFormat = OUTPUT_FORMATS.TEXT,
  isGuest = false
) => {
  try {
    logger.info('Processing conversational contract request', { userId, isGuest });

    // Handle conversation
    const conversation = await handleContractConversation(userId, conversationId, userMessage, isGuest);
    const actualConversationId = conversation.conversationId;

    // Get conversation history
    const conversationHistory = conversation.messages || [];
    const recentHistory = conversationHistory.slice(-10).map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    // Add user message
    await addMessage(actualConversationId, userId, 'user', userMessage, { hasFile: !!fileInfo });

    // Handle file upload if present
    let documentData = null;
    if (fileInfo) {
      documentData = await storeDocumentInConversation(actualConversationId, userId, fileInfo);
    } else if (conversation.contractMetadata?.currentDocumentId) {
      // Use existing document
      documentData = conversation.contractMetadata.uploadedFiles?.find(
        doc => doc.id === conversation.contractMetadata.currentDocumentId
      );
    }

    const fileContext = documentData?.extractedText || null;

    // Get existing parameters
    const existingParams = conversation.contractMetadata?.contractParams || { ...DEFAULT_PARAMS };
    const currentContract = conversation.contractMetadata?.generatedContract || null;
    const pendingQuestions = conversation.contractMetadata?.pendingQuestions || [];
    const currentQuestionIndex = conversation.contractMetadata?.currentQuestionIndex || 0;

    // Check for download intent FIRST (before other scenarios)
    const downloadIntent = await detectDownloadIntent(userMessage);
    logger.info('Download intent detected:', downloadIntent);

    // If user wants to download but no contract exists, inform them
    if (downloadIntent.wantsFile && !currentContract) {
      const responseMessage = `I don't have a contract generated yet for this conversation. Please first describe what type of contract you need, and I'll generate it for you. Then you can request a download link.`;

      await addMessage(actualConversationId, userId, 'assistant', responseMessage);

      return {
        success: false,
        conversationId: actualConversationId,
        response: responseMessage,
        error: 'No contract available for download',
        contractGenerated: false,
      };
    }

    // If user wants to download and contract exists, handle it immediately
    if (downloadIntent.wantsFile && currentContract) {
      const fileUploadResult = await generateAndUploadContractFile(
        currentContract,
        userId,
        {
          format: downloadIntent.format,
          contractType: existingParams.contractType || 'contract',
          conversationId: actualConversationId,
        }
      );

      const responseMessage = `Here's your contract file!\n\nDownload Link: ${fileUploadResult.downloadLink}\n\nFile Name: ${fileUploadResult.fileName}\nFormat: ${fileUploadResult.format.toUpperCase()}\n\n${RESPONSE_MESSAGES.DISCLAIMER}`;

      await addMessage(actualConversationId, userId, 'assistant', responseMessage, {
        fileGenerated: true,
        downloadLink: fileUploadResult.downloadLink,
      });

      return {
        success: true,
        conversationId: actualConversationId,
        response: 'Contract file generated and ready for download!',
        contract: currentContract,
        contractGenerated: true,
        fileGenerated: true,
        downloadLink: fileUploadResult.downloadLink,
        fileName: fileUploadResult.fileName,
        format: fileUploadResult.format,
      };
    }

    // SCENARIO 1: Contract exists and user is answering enhancement questions
    if (currentContract && pendingQuestions.length > 0 && currentQuestionIndex < pendingQuestions.length) {
      const currentQuestion = pendingQuestions[currentQuestionIndex];

      // Update contract with the answer
      const updatedContract = await updateContractWithAnswer(
        currentContract,
        currentQuestion,
        userMessage,
        existingParams.contractType
      );

      // Save updated contract
      await Conversation.updateOne(
        { conversationId: actualConversationId },
        {
          $set: {
            'contractMetadata.generatedContract': updatedContract,
            'contractMetadata.currentQuestionIndex': currentQuestionIndex + 1,
          },
        }
      );

      const nextQuestionIndex = currentQuestionIndex + 1;

      // Check if there are more questions
      if (nextQuestionIndex < pendingQuestions.length) {
        const nextQuestion = pendingQuestions[nextQuestionIndex];
        const responseMessage = `Contract updated!\n\nUPDATED CONTRACT:\n\n${updatedContract}\n\n${RESPONSE_MESSAGES.DISCLAIMER}\n\n---\n\nEnhancement Question ${nextQuestionIndex + 1}/${pendingQuestions.length}:\n${nextQuestion.question}\n\n(Reason: ${nextQuestion.reason})`;

        await addMessage(actualConversationId, userId, 'assistant', responseMessage, {
          contractUpdated: true,
          currentQuestion: nextQuestion,
        });

        return {
          success: true,
          conversationId: actualConversationId,
          response: `Contract updated! Here's the next enhancement question.`,
          contract: updatedContract,
          currentQuestion: nextQuestion,
          questionNumber: nextQuestionIndex + 1,
          totalQuestions: pendingQuestions.length,
          contractGenerated: true,
        };
      } else {
        // All questions answered - generate download link automatically
        const responseMessage = `Contract fully enhanced!\n\nFINAL CONTRACT:\n\n${updatedContract}\n\n${RESPONSE_MESSAGES.DISCLAIMER}\n\n---\n\nAll enhancement questions have been answered. Your contract is complete! Say "give me a download link" or "make it a file" to get a downloadable version.`;

        await addMessage(actualConversationId, userId, 'assistant', responseMessage, {
          contractComplete: true,
        });

        await Conversation.updateOne(
          { conversationId: actualConversationId },
          {
            $set: {
              'contractMetadata.allQuestionsAnswered': true,
            },
          }
        );

        return {
          success: true,
          conversationId: actualConversationId,
          response: 'Contract is complete with all enhancements!',
          contract: updatedContract,
          contractGenerated: true,
          allQuestionsAnswered: true,
        };
      }
    }

    // SCENARIO 2: First message - Generate initial contract immediately
    if (!currentContract) {
      // Analyze contract type
      const analysis = await analyzeContractType(userMessage, fileContext);

      // Generate initial contract right away
      const contractResult = await generateInitialContract(
        userMessage,
        analysis.contractType,
        fileContext,
        analysis.extractedInfo
      );

      // Generate enhancement questions
      const enhancementQuestions = await generateEnhancementQuestions(
        analysis.contractType,
        contractResult.contract,
        recentHistory
      );

      // Update conversation contractMetadata
      const updateResult = await Conversation.updateOne(
        { conversationId: actualConversationId },
        {
          $set: {
            'contractMetadata.contractParams': {
              ...existingParams,
              contractType: analysis.contractType,
            },
            'contractMetadata.contractType': analysis.contractType,
            'contractMetadata.generatedContract': contractResult.contract,
            'contractMetadata.pendingQuestions': enhancementQuestions,
            'contractMetadata.currentQuestionIndex': 0,
            'contractMetadata.contractGenerated': true,
          },
        }
      );

      logger.info('Contract saved to conversation metadata', {
        conversationId: actualConversationId,
        contractLength: contractResult.contract.length,
        updateMatched: updateResult.matchedCount,
        updateModified: updateResult.modifiedCount,
      });

      // Prepare response with contract and first enhancement question
      let responseMessage = `${analysis.summary ? analysis.summary + '\n\n' : ''}DRAFT CONTRACT:\n\n${contractResult.contract}\n\n${RESPONSE_MESSAGES.DISCLAIMER}`;

      if (enhancementQuestions.length > 0) {
        const firstQuestion = enhancementQuestions[0];
        responseMessage += `\n\n---\n\nEnhancement Question 1/${enhancementQuestions.length}:\n${firstQuestion.question}\n\n(Reason: ${firstQuestion.reason})\n\nPlease provide your answer to enhance the contract, or say "skip" to move to the next question.`;

        await addMessage(actualConversationId, userId, 'assistant', responseMessage, {
          contractGenerated: true,
          currentQuestion: firstQuestion,
        });

        return {
          success: true,
          conversationId: actualConversationId,
          response: 'Contract generated! Please answer the enhancement questions.',
          contract: contractResult.contract,
          contractType: analysis.contractType,
          summary: analysis.summary,
          currentQuestion: firstQuestion,
          questionNumber: 1,
          totalQuestions: enhancementQuestions.length,
          contractGenerated: true,
        };
      } else {
        // No enhancement questions
        await addMessage(actualConversationId, userId, 'assistant', responseMessage, {
          contractGenerated: true,
        });

        return {
          success: true,
          conversationId: actualConversationId,
          response: 'Contract generated successfully!',
          contract: contractResult.contract,
          contractType: analysis.contractType,
          summary: analysis.summary,
          contractGenerated: true,
          allQuestionsAnswered: true,
        };
      }
    }

    // SCENARIO 3: Contract exists but user is making a general request (not answering question)
    // This handles modifications or clarifications
    
    // User is making a modification request - process it with AI
    logger.info('Processing contract modification request', { userMessage });
    
    const modifiedContract = await modifyContractWithRequest(
      currentContract,
      userMessage,
      existingParams.contractType || 'general'
    );

    // Save the modified contract
    await Conversation.updateOne(
      { conversationId: actualConversationId },
      {
        $set: {
          'contractMetadata.generatedContract': modifiedContract,
        },
      }
    );

    const responseMessage = `Contract updated based on your request!\n\nMODIFIED CONTRACT:\n\n${modifiedContract}\n\n${RESPONSE_MESSAGES.DISCLAIMER}\n\nYou can request further modifications or say "give me a download link" to get a file.`;

    await addMessage(actualConversationId, userId, 'assistant', responseMessage, {
      contractModified: true,
      modificationRequest: userMessage,
    });

    return {
      success: true,
      conversationId: actualConversationId,
      response: 'Contract modified successfully!',
      contract: modifiedContract,
      contractGenerated: true,
      contractModified: true,
    };
  } catch (error) {
    logger.error('Error processing conversational request:', error);
    throw error;
  }
};

/**
 * Direct contract generation (non-conversational)
 */
const generateContractDirect = async (params, userId, isGuest = false) => {
  try {
    const contractParams = {
      ...DEFAULT_PARAMS,
      ...params,
    };

    // Create a simple conversation for tracking
    const conversationId = generateConversationId();
    await conversationService.createConversation(
      {
        userId,
        title: `Direct Contract: ${params.contractType || 'general'}`,
        metadata: {
          category: CONVERSATION_CATEGORY,
          model: CONVERSATION_MODEL,
          userType: isGuest ? 'guest' : 'authenticated',
          isGuest,
          contractParams,
          directGeneration: true,
        },
      },
      conversationId
    );

    // Generate contract without questions using direct generation
    const contractResult = await generateInitialContract(
      `Generate a ${params.contractType} contract with the following details: ${JSON.stringify(params.terms || {})}`,
      contractParams.contractType,
      null,
      params.terms || {}
    );

    // Store in conversation
    await Conversation.updateOne(
      { conversationId },
      {
        $set: {
          'contractMetadata.generatedContract': contractResult.contract,
          'contractMetadata.contractType': contractResult.contractType,
          'contractMetadata.contractGenerated': true,
        },
      }
    );

    return {
      success: true,
      conversationId,
      contract: contractResult.contract,
      contractType: contractResult.contractType,
    };
  } catch (error) {
    logger.error('Error in direct contract generation:', error);
    throw error;
  }
};

/**
 * Get conversation history
 */
const getConversationHistory = async (conversationId, userId) => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId);

    return {
      conversationId,
      title: conversation.title,
      messages: conversation.messages,
      metadata: conversation.metadata,
      contractMetadata: conversation.contractMetadata,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  } catch (error) {
    logger.error('Error getting conversation history:', error);
    throw error;
  }
};

export const legalContractService = {
  generateGuestUserId,
  processConversationalRequest,
  generateContractDirect,
  getConversationHistory,
  extractTextFromFile,
  cleanupFile,
  detectDownloadIntent,
  generateAndUploadContractFile,
};
