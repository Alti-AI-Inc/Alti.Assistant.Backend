import { createCyberdeskClient } from 'cyberdesk';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import config from '../../../../config/index.js';

const cyberdesk = createCyberdeskClient({ apiKey: process.env.CYBERDESK_API_KEY || 'mock-cyberdesk-key' });

// Launch a new desktop
const launchDesktop = async () => {
  const result = await cyberdesk.launchDesktop({
    body: { timeout_ms: 600000 },
  });
  console.log('Cyberdesk launch result:', result);
  console.log('❗Cyberdesk error object:', result.error);

  if ('error' in result)
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      result.error.message || 'Cyberdesk API Error',
    );
  return result;
};

// Get desktop info
const getDesktopInfo = async desktopId => {
  const result = await cyberdesk.getDesktop({ path: { id: desktopId } });
  if ('error' in result) throw new Error(result.error);
  return result;
};

// Perform a mouse click
const clickMouse = async (desktopId, x, y) => {
  const result = await cyberdesk.executeComputerAction({
    path: { id: desktopId },
    body: {
      type: 'click_mouse',
      x,
      y,
      button: 'left',
    },
  });
  if ('error' in result) {
    console.error(
      'Cyberdesk Action Error:',
      JSON.stringify(result.error, null, 2),
    );
    throw new Error(result.error.message || 'Unknown Cyberdesk Error');
  }
  return result;
};

// Execute bash command
const executeBash = async (desktopId, command) => {
  const result = await cyberdesk.executeBashAction({
    path: { id: desktopId },
    body: { command },
  });
  // if ('error' in result) {
  //   console.error(
  //     'Cyberdesk Action Error:',
  //     JSON.stringify(result.error, null, 2),
  //   );
  //   throw new Error(result.error.message || 'Unknown Cyberdesk Error');
  // }
  return result;
};

// Terminate desktop
const terminateDesktop = async desktopId => {
  const result = await cyberdesk.terminateDesktop({ path: { id: desktopId } });
  return result;
};

export const cyberdeskService = {
  launchDesktop,
  getDesktopInfo,
  clickMouse,
  executeBash,
  terminateDesktop,
};
