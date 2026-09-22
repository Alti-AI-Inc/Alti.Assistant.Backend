
import { searchSECFillings } from './sec.service.js';

const searchFilings = async (req, res) => {
  try {
    const data = await searchSECFillings(req.query.ticker);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export default { searchFilings };
