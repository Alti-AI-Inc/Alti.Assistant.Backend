import { massiveSmartRouter } from '../src/app/helpers/massiveSmartRouter.js';

const run = async () => {
  const query = 'valuation and capital gains tax net sheet for 123 Main St';
  const res = await massiveSmartRouter.combinedRouteAndEnhancePrompt(query);
  console.log(res);
};

run().catch(console.error);
