import { expressMiddleware } from '@apollo/server/express4';
import { ApolloGraphServer } from '../modules/graphql/apollo.service.js';
import { Router } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

export const graphqlRouter = Router();
const apolloServer = ApolloGraphServer.getServer();

// Note: In a real Express setup, you must await apolloServer.start() before applying middleware.
// We simulate this export for architectural completeness.
export const initializeGraphQL = async (app) => {
  await apolloServer.start();
  app.use('/v1/graphql', cors(), bodyParser.json(), expressMiddleware(apolloServer));
};
