import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// Resolve maps API key from standard env variables or fallback to search key
const getApiKey = () => {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY || config.google_search_api_key;
};

/**
 * Natively geocodes a physical string address into geolocational coordinates (lat/lng).
 * 
 * @param {string} address - Physical address to geocode (e.g. "1600 Amphitheatre Pkwy, Mountain View, CA")
 * @returns {Promise<object>} Geocoding result report
 */
const geocodeAddress = async (address) => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('Google Maps API Key is not configured. Please set GOOGLE_MAPS_API_KEY.');
    }

    logger.info(`Maps API: Geocoding address "${address}"...`);

    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address,
        key: apiKey
      }
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Google Maps Geocoding failed with status: ${response.data.status} - ${response.data.error_message || 'No additional details'}`);
    }

    const result = response.data.results[0];
    return {
      success: true,
      formattedAddress: result.formatted_address,
      location: result.geometry?.location, // { lat, lng }
      placeId: result.place_id,
      types: result.types,
      addressComponents: result.address_components
    };
  } catch (err) {
    logger.error('Maps Geocoding Error:', err);
    throw new Error(`Maps Geocoding failed: ${err.message}`);
  }
};

/**
 * Searches for nearby business establishments, landmarks, and points of interest.
 * 
 * @param {number} latitude - Latitude coordinate
 * @param {number} longitude - Longitude coordinate
 * @param {number} [radius] - Radius search boundary in meters (default 5000)
 * @param {string} [keyword] - Keyword filter (e.g., "coffee", "restaurant")
 * @returns {Promise<object>} Nearby places query report
 */
const searchNearbyPlaces = async (latitude, longitude, radius = 5000, keyword = '') => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('Google Maps API Key is not configured.');
    }

    logger.info(`Maps API: Searching nearby places at coordinates [${latitude}, ${longitude}] (radius: ${radius}m, keyword: "${keyword}")...`);

    const params = {
      location: `${latitude},${longitude}`,
      radius,
      key: apiKey
    };

    if (keyword) {
      params.keyword = keyword;
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', { params });

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Maps Places Search failed with status: ${response.data.status} - ${response.data.error_message || 'No additional details'}`);
    }

    const places = (response.data.results || []).map(p => ({
      name: p.name,
      formattedAddress: p.vicinity || p.formatted_address || '',
      location: p.geometry?.location, // { lat, lng }
      placeId: p.place_id,
      rating: p.rating,
      types: p.types,
      openNow: p.opening_hours?.open_now
    }));

    return {
      success: true,
      location: { latitude, longitude },
      radius,
      keyword,
      places
    };
  } catch (err) {
    logger.error('Maps Places Search Error:', err);
    throw new Error(`Maps Places Search failed: ${err.message}`);
  }
};

/**
 * Calculates transit routes, distances, durations, and turn-by-turn driving directions between two points.
 * 
 * @param {string} origin - Starting point name or address
 * @param {string} destination - Ending point name or address
 * @param {string} [mode] - Transit mode: 'driving', 'walking', 'bicycling', 'transit' (default 'driving')
 * @returns {Promise<object>} Turn-by-turn directions report
 */
const calculateRoute = async (origin, destination, mode = 'driving') => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('Google Maps API Key is not configured.');
    }

    logger.info(`Maps API: Calculating route from "${origin}" to "${destination}" (mode: ${mode})...`);

    const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
      params: {
        origin,
        destination,
        mode,
        key: apiKey
      }
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Google Maps Directions failed with status: ${response.data.status} - ${response.data.error_message || 'No additional details'}`);
    }

    const route = response.data.routes[0];
    const leg = route.legs[0];

    const steps = (leg.steps || []).map(s => ({
      instruction: s.html_instructions ? s.html_instructions.replace(/<[^>]*>/g, '') : '', // Strip HTML tags
      distance: s.distance?.text || '',
      duration: s.duration?.text || '',
      startLocation: s.start_location,
      endLocation: s.end_location
    }));

    return {
      success: true,
      origin: leg.start_address,
      destination: leg.end_address,
      distance: leg.distance?.text || '',
      distanceValueBytes: leg.distance?.value || 0, // meters
      duration: leg.duration?.text || '',
      durationValueSeconds: leg.duration?.value || 0, // seconds
      steps
    };
  } catch (err) {
    logger.error('Maps Directions Error:', err);
    throw new Error(`Maps Directions failed: ${err.message}`);
  }
};

/**
 * Retrieves complete place details including business hours, phone number, website, rating, and customer reviews.
 * 
 * @param {string} placeId - Google Place ID
 * @returns {Promise<object>} Complete Places Details report
 */
const getPlaceDetails = async (placeId) => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('Google Maps API Key is not configured.');
    }

    logger.info(`Maps API: Retrieving place details for Place ID "${placeId}"...`);

    const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        key: apiKey
      }
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Google Maps Place Details failed with status: ${response.data.status} - ${response.data.error_message || 'No additional details'}`);
    }

    const result = response.data.result;

    const reviews = (result.reviews || []).map(r => ({
      authorName: r.author_name,
      rating: r.rating,
      text: r.text,
      relativeTime: r.relative_time_description,
      time: r.time
    }));

    const photos = (result.photos || []).map(p => ({
      photoReference: p.photo_reference,
      height: p.height,
      width: p.width
    }));

    return {
      success: true,
      name: result.name || '',
      placeId: result.place_id || placeId,
      formattedAddress: result.formatted_address || '',
      phoneNumber: result.formatted_phone_number || '',
      internationalPhoneNumber: result.international_phone_number || '',
      location: result.geometry?.location, // { lat, lng }
      rating: result.rating,
      userRatingsTotal: result.user_ratings_total,
      website: result.website || '',
      priceLevel: result.price_level,
      businessStatus: result.business_status || 'OPERATIONAL',
      openNow: result.opening_hours?.open_now,
      weekdayText: result.opening_hours?.weekday_text || [],
      reviews,
      photos
    };
  } catch (err) {
    logger.error('Maps Place Details Error:', err);
    throw new Error(`Maps Place Details failed: ${err.message}`);
  }
};

/**
 * Generates the programmatic direct photo URL from a Google Place photo reference.
 * 
 * @param {string} photoReference - Google Place photo_reference
 * @param {number} [maxWidth] - Target width in pixels (default 800)
 * @returns {object} Photo URL details
 */
const getPlacePhotoUrl = (photoReference, maxWidth = 800) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API Key is not configured.');
  }

  const url = `https://maps.googleapis.com/maps/api/place/photo?photo_reference=${photoReference}&maxwidth=${maxWidth}&key=${apiKey}`;

  return {
    success: true,
    photoReference,
    maxWidth,
    photoUrl: url
  };
};

export const GcpMapsService = {
  geocodeAddress,
  searchNearbyPlaces,
  calculateRoute,
  getPlaceDetails,
  getPlacePhotoUrl
};
