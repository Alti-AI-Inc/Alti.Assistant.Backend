import axios from 'axios';
import config from '../../../../config/index.js';
import { twitterIntegrationId } from './composio.constant.js';

const getAuthenticatedTwitterUserId = async connectedAccountId => {
  const url =
    'https://backend.composio.dev/api/v2/actions/TWITTER_USER_LOOKUP_BY_USERNAMES/execute';

  const response = await axios.post(
    url,
    {
      integrationId: twitterIntegrationId,
      connectedAccountId,
      input: {
        usernames: ['me'], // 👈 'me' refers to the connected user
        user__fields: ['id', 'username'],
      }, // no input needed
    },
    {
      headers: {
        'x-api-key': config.composio.apiKey,
        'Content-Type': 'application/json',
      },
    },
  );

  const user = response.data?.data?.data?.[0];
  if (!user?.id) {
    throw new Error('Authenticated Twitter user ID not found');
  }
  return user.id;
};

export const composioHelper = {
  getAuthenticatedTwitterUserId,
};
