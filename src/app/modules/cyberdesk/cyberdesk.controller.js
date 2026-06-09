import { cyberdeskService } from './cyberdesk.service.js';

const launch = async (req, res) => {
  try {
    const result = await cyberdeskService.launchDesktop();
    res.status(200).json({ message: 'Desktop launched', data: result });
  } catch (err) {
    // Log the detailed error for internal debugging, but send a generic message to the client
    console.error('Error launching desktop:', err);
    res.status(500).json({ error: 'Failed to launch desktop.' });
  }
};

const info = async (req, res) => {
  const { id } = req.params;

  // Validate input: Ensure 'id' is provided and is a string.
  // Depending on the expected format of 'id' (e.g., UUID, integer), more specific validation might be needed.
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Desktop ID is required and must be a string.' });
  }

  try {
    const result = await cyberdeskService.getDesktopInfo(id);
    // Consider returning 404 Not Found if result is null/undefined and indicates no desktop found.
    res.status(200).json(result);
  } catch (err) {
    console.error(`Error getting info for desktop ID ${id}:`, err);
    res.status(500).json({ error: 'Failed to retrieve desktop information.' });
  }
};

const click = async (req, res) => {
  const { id } = req.params;
  const { x, y } = req.body;

  // Validate input: Ensure 'id' is provided and is a string.
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Desktop ID is required and must be a string.' });
  }
  // Validate input: Ensure 'x' and 'y' are provided and are numbers.
  if (typeof x !== 'number' || isNaN(x) || typeof y !== 'number' || isNaN(y)) {
    return res.status(400).json({ error: 'Coordinates x and y are required and must be numbers.' });
  }

  try {
    const result = await cyberdeskService.clickMouse(id, x, y);
    res.status(200).json(result);
  } catch (err) {
    console.error(`Error clicking mouse for desktop ID ${id} at (${x}, ${y}):`, err);
    res.status(500).json({ error: 'Failed to perform mouse click.' });
  }
};

const bash = async (req, res) => {
  const { id } = req.params;
  const { command } = req.body;

  // Validate input: Ensure 'id' is provided and is a string.
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Desktop ID is required and must be a string.' });
  }
  // Validate input: Ensure 'command' is provided and is a string.
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Command is required and must be a string.' });
  }

  // SECURITY WARNING: Directly executing user-provided bash commands is extremely dangerous.
  // This endpoint is highly vulnerable to command injection if 'cyberdeskService.executeBash'
  // does not implement robust sanitization, whitelisting, or use safe execution methods
  // (e.g., child_process.spawn with arguments) to prevent arbitrary code execution on the server.
  // It is strongly recommended to restrict this functionality or replace it with a more
  // controlled set of predefined actions.
  try {
    const result = await cyberdeskService.executeBash(id, command);
    res.status(200).json(result);
  } catch (err) {
    console.error(`Error executing bash command for desktop ID ${id}: "${command}"`, err);
    res.status(500).json({ error: 'Failed to execute bash command.' });
  }
};

const terminate = async (req, res) => {
  const { id } = req.params;

  // Validate input: Ensure 'id' is provided and is a string.
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Desktop ID is required and must be a string.' });
  }

  try {
    const result = await cyberdeskService.terminateDesktop(id);
    res.status(200).json(result);
  } catch (err) {
    console.error(`Error terminating desktop ID ${id}:`, err);
    res.status(500).json({ error: 'Failed to terminate desktop.' });
  }
};

export const cyberdeskController = {
  launch,
  info,
  click,
  bash,
  terminate,
};