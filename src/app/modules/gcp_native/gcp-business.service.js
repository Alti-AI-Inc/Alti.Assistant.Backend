import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { GcpMapsService } from './gcp-maps.service.js';

// Setup scoped authentication client for Google My Business Management APIs
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/business.manage']
});

/**
 * Lists physical business locations associated with a Google Business Profile account.
 * 
 * @param {string} accountId - Business Account ID (e.g. "123456789")
 * @returns {Promise<object>} Verified locations list report
 */
const listBusinessLocations = async (accountId) => {
  try {
    logger.info(`Business API: Fetching verified locations list for Account ID "${accountId}"...`);

    const client = await auth.getClient();
    const endpoint = `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`;

    const response = await client.request({
      url: endpoint,
      method: 'GET',
      params: {
        readMask: 'name,title,storefrontAddress,metadata,websiteUri,phoneNumbers'
      }
    });

    return {
      success: true,
      accountId,
      locations: response.data?.locations || []
    };
  } catch (err) {
    logger.error('Business Profile Locations Fetch Error:', err);
    throw new Error(`Business locations list failed: ${err.message}`);
  }
};

/**
 * Retrieves customer reviews and owner responses for a Google Business Profile location.
 * 
 * @param {string} accountId - Business Account ID
 * @param {string} locationId - Specific Location ID
 * @returns {Promise<object>} Customer reviews report
 */
const listLocationReviews = async (accountId, locationId) => {
  try {
    const locationName = `accounts/${accountId}/locations/${locationId}`;
    logger.info(`Business API: Retrieving customer reviews for Location "${locationName}"...`);

    const client = await auth.getClient();
    // Use account management API reviews endpoint
    const endpoint = `https://mybusinessaccountmanagement.googleapis.com/v1/${locationName}/reviews`;

    const response = await client.request({
      url: endpoint,
      method: 'GET'
    });

    const reviewsList = (response.data?.reviews || []).map(r => ({
      reviewId: r.reviewId,
      reviewerName: r.reviewer?.displayName || 'Anonymous Customer',
      starRating: r.starRating, // e.g. 'FIVE' or 'FOUR'
      comment: r.comment || '',
      createTime: r.createTime,
      updateTime: r.updateTime,
      reviewReply: r.reviewReply ? {
        comment: r.reviewReply.comment,
        updateTime: r.reviewReply.updateTime
      } : null
    }));

    return {
      success: true,
      accountId,
      locationId,
      locationName,
      averageRating: response.data?.averageRating || 0,
      totalReviewCount: response.data?.totalReviewCount || reviewsList.length,
      reviews: reviewsList
    };
  } catch (err) {
    logger.error('Business Profile Reviews Fetch Error:', err);
    throw new Error(`Business reviews list failed: ${err.message}`);
  }
};

/**
 * Creates an update, offer, or event post for a local business location on Google Search & Maps.
 * 
 * @param {string} accountId - Business Account ID
 * @param {string} locationId - Specific Location ID
 * @param {object} postPayload - Post details (e.g. { summary: "Join us for Alti launch!", callToAction: { actionType: "LEARN_MORE", url: "https://alti.assistant" } })
 * @returns {Promise<object>} Local post publication report
 */
const createLocalPost = async (accountId, locationId, postPayload) => {
  try {
    const locationName = `accounts/${accountId}/locations/${locationId}`;
    logger.info(`Business API: Creating new Google Local Post for Location "${locationName}"...`);

    const client = await auth.getClient();
    const endpoint = `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}/localPosts`;

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: postPayload
    });

    return {
      success: true,
      postId: response.data?.name,
      state: response.data?.state || 'LIVE',
      searchUrl: response.data?.searchUrl,
      languageCode: response.data?.languageCode,
      createTime: response.data?.createTime
    };
  } catch (err) {
    logger.error('Business Profile Post Creation Error:', err);
    throw new Error(`Business local post creation failed: ${err.message}`);
  }
};

/**
 * High-Fidelity Cognitive Aggregator: Geocodes, retrieves complete details, rating,
 * and up-to-date customer review parameters in a single unified JSON payload.
 * 
 * @param {string} query - Location name or physical address (e.g. "Starbucks near Mountain View")
 * @returns {Promise<object>} Structured Unified Business Intelligence report
 */
const getUnifiedBusinessIntelligence = async (query) => {
  try {
    logger.info(`Cognitive Aggregator: Processing Unified Business Intelligence for query "${query}"...`);

    // 1. Geocode the address to find the Place ID
    const geocode = await GcpMapsService.geocodeAddress(query);
    if (!geocode.success || !geocode.placeId) {
      throw new Error(`Could not geocode the address query: ${query}`);
    }

    // 2. Fetch complete Place Details and Reviews using the Place ID
    const details = await GcpMapsService.getPlaceDetails(geocode.placeId);
    if (!details.success) {
      throw new Error(`Could not fetch Places Details for Place ID: ${geocode.placeId}`);
    }

    // 3. Construct the clean Unified Intelligence Payload
    return {
      success: true,
      query,
      name: details.name,
      placeId: details.placeId,
      formattedAddress: details.formattedAddress,
      phoneNumber: details.phoneNumber,
      internationalPhoneNumber: details.internationalPhoneNumber,
      website: details.website,
      rating: details.rating,
      userRatingsTotal: details.userRatingsTotal,
      location: details.location,
      priceLevel: details.priceLevel,
      businessStatus: details.businessStatus,
      openNow: details.openNow,
      weekdayText: details.weekdayText,
      reviewsCount: details.reviews?.length || 0,
      topReviews: (details.reviews || []).slice(0, 3), // top 3 clean reviews
      rawReviews: details.reviews || [],
      photosList: details.photos || [],
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    logger.error('Unified Business Intelligence Aggregator Error:', err);
    throw new Error(`Unified Business Intelligence failed: ${err.message}`);
  }
};

export const GcpBusinessService = {
  listBusinessLocations,
  listLocationReviews,
  createLocalPost,
  getUnifiedBusinessIntelligence
};
