import { cyberdeskService } from './cyberdesk.service.js';

const launch = async (req, res) => {
  try {
    const result = await cyberdeskService.launchDesktop();
    res.status(200).json({ message: 'Desktop launched', data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const info = async (req, res) => {
  try {
    const result = await cyberdeskService.getDesktopInfo(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const click = async (req, res) => {
  const { x, y } = req.body;
  try {
    const result = await cyberdeskService.clickMouse(req.params.id, x, y);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const bash = async (req, res) => {
  const { command } = req.body;
  try {
    const result = await cyberdeskService.executeBash(req.params.id, command);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const terminate = async (req, res) => {
  try {
    const result = await cyberdeskService.terminateDesktop(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const cyberdeskController = {
  launch,
  info,
  click,
  bash,
  terminate,
};
