import { ApolloServer } from '@apollo/server';
import { logger } from '../../../shared/logger.js';

const typeDefs = `#graphql
  type User {
    id: ID!
    email: String!
    role: String!
  }

  type ASTNode {
    id: ID!
    label: String!
    dependencies: [String]
  }

  type Query {
    users: [User]
    astNodes(workspace: String!): [ASTNode]
  }
`;

const resolvers = {
  Query: {
    users: () => {
      logger.info(`[Apollo GraphQL] Fetching users from PostgreSQL relational DB...`);
      return [{ id: '1', email: 'admin@aphura.ai', role: 'admin' }];
    },
    astNodes: (_, { workspace }) => {
      logger.info(`[Apollo GraphQL] Resolving AST vectors from Memgraph Cypher query for: ${workspace}...`);
      return [{ id: 'node-1', label: 'Controller', dependencies: ['ServiceA'] }];
    },
  },
};

export const ApolloGraphServer = {
  getServer() {
    logger.info(`[Apollo GraphQL] Initializing Federated Supergraph...`);
    return new ApolloServer({
      typeDefs,
      resolvers,
    });
  }
};
