// import OAuth from 'oauth';
// import jwt from 'jsonwebtoken';
// import { findOrCreateUserModel } from '../../social-login.utils.js';
// import config from '../../../../../../config/index.js';
// import { logger } from '../../../../../shared/logger.js';

// // Ensure BASE_URL doesn't have a trailing slash
// const BASE_URL = process.env.BASE_URL.endsWith('/')
//     ? process.env.BASE_URL.slice(0, -1)
//     : process.env.BASE_URL;

// const CALLBACK_URL = `${BASE_URL}/auth-social/twitter/callback`;

// // Manual OAuth1.0a implementation with error handling
// const oauth = new OAuth.OAuth(
//     'https://api.twitter.com/oauth/request_token',
//     'https://api.twitter.com/oauth/access_token',
//     process.env.TWITTER_CONSUMER_KEY,
//     process.env.TWITTER_CONSUMER_SECRET,
//     '1.0A',
//     CALLBACK_URL,
//     'HMAC-SHA1',
//     null, // No body length
//     { // Include headers to be more compatible with Twitter's API
//         'Accept': '*/*',
//         'User-Agent': 'YourAppName',
//         'Connection': 'close',
//         'X-Target-URI': 'https://api.twitter.com',
//         'Content-Type': 'application/x-www-form-urlencoded'
//     }
// );

// // Store for request tokens
// const tokenStore = {};

// // Create a manual middleware for Twitter OAuth
// export const twitterAuth = {
//     // Initiate OAuth flow
//     authenticate: (req, res) => {
//         logger.info('Twitter Auth - Starting OAuth flow');
//         logger.info('Using consumer key:', process.env.TWITTER_CONSUMER_KEY);
//         logger.info('Callback URL:', CALLBACK_URL);

//         // Add additional params required by Twitter
//         const extraParams = {};

//         oauth.getOAuthRequestToken(extraParams, (err, token, secret, results) => {
//             if (err) {
//                 console.error('Twitter OAuth error:', err);
//                 console.error('Error data:', err.data);

//                 return res.status(500).json({
//                     status: false,
//                     message: 'Failed to get request token',
//                     errorMessages: [{
//                         path: '',
//                         message: err.message || 'Twitter OAuth initialization failed'
//                     }]
//                 });
//             }

//             logger.info('Twitter Auth - Got request token:', token);
//             logger.info('Results:',  results);

//             // Store the token secret for later
//             tokenStore[token] = secret;

//             // Set a timeout to clean up (optional)
//             setTimeout(() => delete tokenStore[token], 15 * 60 * 1000); // 15 minutes

//             // Redirect to Twitter
//             res.redirect(`https://api.twitter.com/oauth/authenticate?oauth_token=${token}`);
//         });
//     },

//     // Handle callback from Twitter
//     callback: (req, res) => {
//         const { oauth_token, oauth_verifier } = req.query;

//         if (!oauth_token || !oauth_verifier) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Missing oauth_token or oauth_verifier',
//                 errorMessages: [{ path: '', message: 'Missing oauth_token or oauth_verifier' }]
//             });
//         }

//         const requestTokenSecret = tokenStore[oauth_token];

//         if (!requestTokenSecret) {
//             return res.status(400).json({
//                 status: false,
//                 message: 'Invalid or expired token',
//                 errorMessages: [{ path: '', message: 'Invalid or expired token' }]
//             });
//         }

//         // Clean up the token from store
//         delete tokenStore[oauth_token];

//         // Exchange for access token
//         oauth.getOAuthAccessToken(
//             oauth_token,
//             requestTokenSecret,
//             oauth_verifier,
//             async (err, accessToken, accessTokenSecret) => {
//                 if (err) {
//                     return res.status(500).json({
//                         status: false,
//                         message: 'Failed to get access token',
//                         errorMessages: [{ path: '', message: err.message }]
//                     });
//                 }

//                 // Get user info from Twitter
//                 oauth.get(
//                     'https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true',
//                     accessToken,
//                     accessTokenSecret,
//                     async (err, data) => {
//                         if (err) {
//                             return res.status(500).json({
//                                 status: false,
//                                 message: 'Failed to get user profile',
//                                 errorMessages: [{ path: '', message: err.message }]
//                             });
//                         }

//                         try {
//                             const profile = JSON.parse(data);

//                             const twitterProfile = {
//                                 id: profile.id_str,
//                                 username: profile.screen_name,
//                                 displayName: profile.name,
//                                 emails: profile.email ? [{ value: profile.email }] : [],
//                                 photos: profile.profile_image_url_https ?
//                                     [{ value: profile.profile_image_url_https }] : []
//                             };

//                             const user = await findOrCreateUserModel({
//                                 ...twitterProfile,
//                                 email: profile.email || null
//                             }, 'twitter');

//                             // Generate and send JWT token
//                             const token = jwt.sign(
//                                 {
//                                     email: user.email,
//                                     role: user.role,
//                                     id: user._id
//                                 },
//                                 config.jwt.access_token,
//                                 { expiresIn: '7d' }
//                             );

//                             // return res.redirect(process.env.CLIENT_URL + '/auth/callback#token=' + token);
//                             return res.status(200).send({
//                                 mgs: 'Login successful...!',
//                                 email: user.email,
//                                 token
//                             });
//                         } catch (error) {
//                             return res.status(500).json({
//                                 status: false,
//                                 message: 'Error processing user data',
//                                 errorMessages: [{ path: '', message: error.message }]
//                             });
//                         }
//                     }
//                 );
//             }
//         );
//     }
// };

import { Strategy as TwitterStrategy } from 'passport-twitter-oauth2';
import { findOrCreateUserModel } from '../../social-login.utils.js';

// NOTE: This uses passport-twitter-oauth2 for Twitter API v2
/**
 * Configuration for the Twitter OAuth2 Passport strategy.
 * This strategy authenticates users via their Twitter account using the OAuth 2.0 protocol (PKCE flow for confidential clients).
 * It handles the user redirection to Twitter for authorization, the callback from Twitter,
 * and the exchange of an authorization code for an access token and user profile.
 *
 * @see {@link https://github.com/auth0/passport-twitter-oauth2} for more information on the strategy.
 * @constant {TwitterStrategy}
 */
const strategy = new TwitterStrategy(
  /**
   * Options for the Twitter OAuth2 strategy.
   * @type {import('passport-twitter-oauth2').StrategyOptions}
   * @property {string} clientID - The Client ID for your Twitter application. Sourced from `process.env.TWITTER_CLIENT_ID`.
   * @property {string} clientSecret - The Client Secret for your Twitter application. Sourced from `process.env.TWITTER_CLIENT_SECRET`.
   * @property {string} callbackURL - The URL where Twitter will redirect the user after they grant or deny permission.
   *                                  Sourced from `process.env.TWITTER_CALLBACK_URL` or defaults to '/api/v1/auth-social/twitter/callback'.
   * @property {string} clientType - The type of client. 'confidential' is used for server-side applications that can securely store secrets.
   * @property {string[]} scope - An array of permissions (scopes) to request from the user.
   *                              'tweet.read' and 'users.read' are required to access profile information.
   *                              'offline.access' is required to receive a refresh token.
   * @property {boolean} passReqToCallback - If true, the `req` object would be passed as the first argument to the verify callback.
   *                                         Set to false as the request object is not needed for this authentication flow.
   * @property {boolean} proxy - If true, the strategy will trust the `X-Forwarded-Proto` header, which is necessary when the application is behind a reverse proxy (e.g., on a cloud platform).
   */
  {
    clientID: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
    callbackURL: process.env.TWITTER_CALLBACK_URL || '/api/v1/auth-social/twitter/callback',
    clientType: 'confidential', // Important for web applications
    scope: ['tweet.read', 'users.read', 'offline.access'], // Standard scopes for reading profile
    passReqToCallback: false, // Set to false, we don't need the req object here
    proxy: true,
  },
  /**
   * The verify callback for the Twitter OAuth2 strategy.
   * This function is invoked after a user successfully authenticates with Twitter.
   * It receives the access token, refresh token, and user profile.
   * Its purpose is to find an existing user in the database or create a new one,
   * and then call the `done` callback with the user object.
   *
   * @async
   * @param {string} accessToken - The access token from Twitter, used to make API requests on behalf of the user.
   * @param {string} refreshToken - The refresh token from Twitter, used to obtain a new access token when the current one expires.
   * @param {object} profile - The user's profile information as provided by the Twitter API.
   * @param {function(Error | null, object | boolean, object?)} done - The Passport `done` callback. It is called to signal the completion of the authentication process.
   *   - `done(null, user)` - on success, provides the authenticated user object.
   *   - `done(null, false)` - on authentication failure (e.g., user not found and not created).
   *   - `done(error)` - on an internal error (e.g., database connection issue).
   * @returns {Promise<void>}
   */
  async (accessToken, refreshToken, profile, done) => {
    console.log('profile: twitter: ', profile);

    try {
      /**
       * The Twitter profile is adapted to a standardized format used within the application.
       * This ensures consistency regardless of the social login provider.
       * @type {{id: string, displayName: string, username: string, photos: Array<{value: string | undefined}>, emails: Array<{value: string}>, provider: string}}
       */
      const adaptedProfile = {
        id: profile.id,
        displayName: profile.displayName,
        username: profile.username,
        photos: profile.photos ? [{ value: profile.photos[0]?.url }] : [],
        emails: profile.email ? [{ value: profile.email }] : [],
        provider: 'twitter',
      };

      // Find an existing user or create a new one based on the Twitter profile information.
      const { user } = await findOrCreateUserModel(adaptedProfile, 'twitter');

      // Authentication was successful. Pass the user object to Passport.
      // Passport will attach this user to the request (e.g., `req.user`).
      return done(null, { user });
    } catch (err) {
      // An error occurred during the process (e.g., a database error).
      // Pass the error to Passport to terminate the authentication process.
      return done(err, null);
    }
  }
);

export default strategy;