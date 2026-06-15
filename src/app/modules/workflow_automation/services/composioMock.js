/**
 * Local mock stub of the Composio SDK to allow the application to boot
 * and execute tests cleanly without requiring the external `@composio/core` dependency.
 */
export class Composio {
  constructor(config = {}) {
    this.apiKey = config.apiKey;
    this.connectedAccounts = {
      get: async (id) => {
        return {
          id,
          status: 'CONNECTED',
          connectionStatus: 'ACTIVE',
          app: 'mock-app',
        };
      },
      initiate: async (params) => {
        return {
          connectionUrl: 'https://mock.composio.url/connect',
          connectedAccountId: 'mock-connected-account-id',
        };
      }
    };
  }

  async getTools(params = {}, userId) {
    return [];
  }
}
