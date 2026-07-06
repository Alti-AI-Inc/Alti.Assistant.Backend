import videoService from '../../services/videoService.js';
import imageService from '../../../../agent-image/src/services/imageService.js';
import { createLogger } from '../../../../../shared/logging/index.js';

const { logger } = createLogger('videoGeneratorAgent');

export async function chatInterviewer(state) {
  logger.info('Running video chat interviewer');
  if (state.state !== 'gather') return {};
  
  const reply = await videoService.gatherDetails(state.prompt, state.conversationHistory);
  return { reply };
}

export async function confirmDetails(state) {
  logger.info('Running video confirm details');
  if (state.state !== 'confirm') return {};

  const confirmation = await videoService.confirmDetails(state.prompt, state.conversationHistory);
  return { 
    reply: confirmation.reply,
    enhancedPrompt: confirmation.enhancedPrompt
  };
}

export async function analyzeVideoPrompt(state) {
  logger.info('Analyzing video prompt for generation');
  return { qualityTier: 'standard' };
}

export async function createStoryboard(state) {
  logger.info('Creating storyboard');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const storyboardShots = await videoService.createStoryboard(finalPrompt);
  
  // Generate a storyboard frame for each scene using Image Agent
  const storyboard = [];
  for (const shot of storyboardShots) {
    logger.info(`Generating image frame for shot: ${shot.description}`);
    const imageResult = await imageService.generateImage(
      `${shot.description} ${shot.cameraAngle ? ', camera angle: ' + shot.cameraAngle : ''}`,
      state.userContext
    );
    storyboard.push({
      ...shot,
      imageUrl: imageResult.imageUrl,
      imageBase64: imageResult.imageBase64
    });
  }

  return { storyboard };
}

export async function generateVideo(state) {
  logger.info('Generating video');
  
  if (state.storyboard && state.storyboard.length > 0) {
    logger.info('Animating storyboard scenes chronologically');
    // Generate a video clip for each storyboard shot
    const clips = [];
    for (const shot of state.storyboard) {
      logger.info(`Animating shot: ${shot.description}`);
      const result = await videoService.generateVideo(shot.description, state.userContext, { 
        referenceImage: shot.imageBase64
      });
      clips.push({
        videoUrl: result.videoUrl,
        metadata: result.metadata
      });
    }
    
    // In a real application, we would concatenate these clips here.
    // For now, we return the first clip as the primary videoUrl, and the rest in metadata
    return { 
      videoUrl: clips[0].videoUrl,
      operationName: clips[0].metadata.operationName,
      metadata: { 
        clips,
        storyboardUsed: true
      }
    };
  } else {
    // Standard single-video generation
    const finalPrompt = state.enhancedPrompt || state.prompt;
    const result = await videoService.generateVideo(finalPrompt, state.userContext, { 
      referenceImage: state.referenceImage 
    });
    return { 
      videoUrl: result.videoUrl,
      operationName: result.metadata.operationName,
      metadata: result.metadata
    };
  }
}
