import parser from './parser.js';
import generator from './generator.js';
import bundle from './bundle.js';

export {
  parser,
  generator,
  bundle
};

export default {
  ...parser,
  ...generator,
  ...bundle
};
