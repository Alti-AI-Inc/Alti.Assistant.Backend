import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../../shared/logger.js';
import { GcpMapsService } from './gcp-maps.service.js';
import { GcpBusinessService } from './gcp-business.service.js';

// Mock dependencies
const mockRequest = vi.fn();
const mockGetClient = vi.fn().mockResolvedValue({ request: mockRequest });

vi.mock('google-auth-library', () => {
  const GoogleAuth = vi.fn().mockImplementation(() => ({
    getClient: mockGetClient,
  }));
  return { GoogleAuth };
});

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./gcp-maps.service.js', () => ({
  GcpMapsService: {
    geocodeAddress: vi.fn(),
    getPlaceDetails: vi.fn(),
  },
}));

describe('GcpBusinessService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listBusinessLocations', () => {
    const accountId = '123456789';

    it('should fetch and return a list of business locations successfully', async () => {
      const mockApiResponse = {
        data: {
          locations: [
            { name: 'locations/1', title: 'Store A', storefrontAddress: { addressLines: ['123 Main St'] } },
            { name: 'locations/2', title: 'Store B', storefrontAddress: { addressLines: ['456 Oak Ave'] } },
          ],
        },
      };
      mockRequest.mockResolvedValue(mockApiResponse);

      const result = await GcpBusinessService.listBusinessLocations(accountId);

      expect(logger.info).toHaveBeenCalledWith(`Business API: Fetching verified locations list for Account ID "${accountId}"...`);
      expect(mockGetClient).toHaveBeenCalled();
      expect(mockRequest).toHaveBeenCalledWith({
        url: `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`,
        method: 'GET',
        params: {
          readMask: 'name,title,storefrontAddress,metadata,websiteUri,phoneNumbers',
        },
      });
      expect(result).toEqual({
        success: true,
        accountId,
        locations: mockApiResponse.data.locations,
      });
    });

    it('should return an empty array if no locations are found', async () => {
      const mockApiResponse = { data: { locations: null } };
      mockRequest.mockResolvedValue(mockApiResponse);

      const result = await GcpBusinessService.listBusinessLocations(accountId);

      expect(result).toEqual({
        success: true,
        accountId,
        locations: [],
      });
    });

    it('should throw an error if the API call fails', async () => {
      const apiError = new Error('API request failed');
      mockRequest.mockRejectedValue(apiError);

      await expect(GcpBusinessService.listBusinessLocations(accountId)).rejects.toThrow(
        `Business locations list failed: ${apiError.message}`
      );

      expect(logger.error).toHaveBeenCalledWith('Business Profile Locations Fetch Error:', apiError);
    });
  });

  describe('listLocationReviews', () => {
    const accountId = 'acc123';
    const locationId = 'loc456';
    const locationName = `accounts/${accountId}/locations/${locationId}`;

    it('should fetch and return a formatted list of reviews', async () => {
      const mockApiResponse = {
        data: {
          reviews: [
            {
              reviewId: 'r1',
              reviewer: { displayName: 'John D.' },
              starRating: 'FIVE',
              comment: 'Excellent!',
              createTime: '2023-01-01T00:00:00Z',
              updateTime: '2023-01-01T00:00:00Z',
              reviewReply: { comment: 'Thank you!', updateTime: '2023-01-02T00:00:00Z' },
            },
            {
              reviewId: 'r2',
              reviewer: null, // anonymous
              starRating: 'ONE',
              comment: '', // no comment
              createTime: '2023-02-01T00:00:00Z',
              updateTime: '2023-02-01T00:00:00Z',
              reviewReply: null, // no reply
            },
          ],
          averageRating: 4.5,
          totalReviewCount: 50,
        },
      };
      mockRequest.mockResolvedValue(mockApiResponse);

      const result = await GcpBusinessService.listLocationReviews(accountId, locationId);

      expect(logger.info).toHaveBeenCalledWith(`Business API: Retrieving customer reviews for Location "${locationName}"...`);
      expect(mockRequest).toHaveBeenCalledWith({
        url: `https://mybusinessaccountmanagement.googleapis.com/v1/${locationName}/reviews`,
        method: 'GET',
      });
      expect(result).toEqual({
        success: true,
        accountId,
        locationId,
        locationName,
        averageRating: 4.5,
        totalReviewCount: 50,
        reviews: [
          {
            reviewId: 'r1',
            reviewerName: 'John D.',
            starRating: 'FIVE',
            comment: 'Excellent!',
            createTime: '2023-01-01T00:00:00Z',
            updateTime: '2023-01-01T00:00:00Z',
            reviewReply: { comment: 'Thank you!', updateTime: '2023-01-02T00:00:00Z' },
          },
          {
            reviewId: 'r2',
            reviewerName: 'Anonymous Customer',
            starRating: 'ONE',
            comment: '',
            createTime: '2023-02-01T00:00:00Z',
            updateTime: '2023-02-01T00:00:00Z',
            reviewReply: null,
          },
        ],
      });
    });

    it('should handle cases with no reviews gracefully', async () => {
        const mockApiResponse = { data: {} }; // No reviews, no rating
        mockRequest.mockResolvedValue(mockApiResponse);
  
        const result = await GcpBusinessService.listLocationReviews(accountId, locationId);
  
        expect(result).toEqual({
          success: true,
          accountId,
          locationId,
          locationName,
          averageRating: 0,
          totalReviewCount: 0,
          reviews: [],
        });
      });

    it('should throw an error if the API call fails', async () => {
      const apiError = new Error('API request failed');
      mockRequest.mockRejectedValue(apiError);

      await expect(GcpBusinessService.listLocationReviews(accountId, locationId)).rejects.toThrow(
        `Business reviews list failed: ${apiError.message}`
      );

      expect(logger.error).toHaveBeenCalledWith('Business Profile Reviews Fetch Error:', apiError);
    });
  });

  describe('createLocalPost', () => {
    const accountId = 'acc123';
    const locationId = 'loc456';
    const locationName = `accounts/${accountId}/locations/${locationId}`;
    const postPayload = { summary: 'New event!', event: { title: 'Grand Opening' } };

    it('should create a local post and return the result', async () => {
      const mockApiResponse = {
        data: {
          name: 'posts/p123',
          state: 'PROCESSING',
          searchUrl: 'https://search.google.com/local/posts?q=...',
          languageCode: 'en-US',
          createTime: '2023-10-01T10:00:00Z',
        },
      };
      mockRequest.mockResolvedValue(mockApiResponse);

      const result = await GcpBusinessService.createLocalPost(accountId, locationId, postPayload);

      expect(logger.info).toHaveBeenCalledWith(`Business API: Creating new Google Local Post for Location "${locationName}"...`);
      expect(mockRequest).toHaveBeenCalledWith({
        url: `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}/localPosts`,
        method: 'POST',
        data: postPayload,
      });
      expect(result).toEqual({
        success: true,
        postId: 'posts/p123',
        state: 'PROCESSING',
        searchUrl: 'https://search.google.com/local/posts?q=...',
        languageCode: 'en-US',
        createTime: '2023-10-01T10:00:00Z',
      });
    });

    it('should throw an error if the post creation API call fails', async () => {
      const apiError = new Error('Invalid post payload');
      mockRequest.mockRejectedValue(apiError);

      await expect(GcpBusinessService.createLocalPost(accountId, locationId, postPayload)).rejects.toThrow(
        `Business local post creation failed: ${apiError.message}`
      );

      expect(logger.error).toHaveBeenCalledWith('Business Profile Post Creation Error:', apiError);
    });
  });

  describe('getUnifiedBusinessIntelligence', () => {
    const query = 'Starbucks near me';
    const mockGeocodeResponse = { success: true, placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4' };
    const mockPlaceDetailsResponse = {
        success: true,
        name: 'Starbucks',
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        formattedAddress: '123 Coffee St, Brewville, CA',
        phoneNumber: '(555) 123-4567',
        internationalPhoneNumber: '+1 555-123-4567',
        website: 'https://starbucks.com',
        rating: 4.5,
        userRatingsTotal: 1500,
        location: { lat: 34.05, lng: -118.25 },
        priceLevel: 2,
        businessStatus: 'OPERATIONAL',
        openNow: true,
        weekdayText: ['Monday: 6:00 AM – 9:00 PM'],
        reviews: [
          { text: 'Great coffee' }, { text: 'Fast service' }, { text: 'Clean place' }, { text: 'A bit noisy' }
        ],
        photos: [{ photo_reference: 'photo_ref_1' }],
      };

    it('should aggregate geocode and place details into a unified report', async () => {
      vi.spyOn(global, 'Date').mockImplementation(() => new Date('2023-01-01T00:00:00.000Z'));
      GcpMapsService.geocodeAddress.mockResolvedValue(mockGeocodeResponse);
      GcpMapsService.getPlaceDetails.mockResolvedValue(mockPlaceDetailsResponse);

      const result = await GcpBusinessService.getUnifiedBusinessIntelligence(query);

      expect(logger.info).toHaveBeenCalledWith(`Cognitive Aggregator: Processing Unified Business Intelligence for query "${query}"...`);
      expect(GcpMapsService.geocodeAddress).toHaveBeenCalledWith(query);
      expect(GcpMapsService.getPlaceDetails).toHaveBeenCalledWith(mockGeocodeResponse.placeId);
      
      expect(result).toEqual({
        success: true,
        query,
        name: 'Starbucks',
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        formattedAddress: '123 Coffee St, Brewville, CA',
        phoneNumber: '(555) 123-4567',
        internationalPhoneNumber: '+1 555-123-4567',
        website: 'https://starbucks.com',
        rating: 4.5,
        userRatingsTotal: 1500,
        location: { lat: 34.05, lng: -118.25 },
        priceLevel: 2,
        businessStatus: 'OPERATIONAL',
        openNow: true,
        weekdayText: ['Monday: 6:00 AM – 9:00 PM'],
        reviewsCount: 4,
        topReviews: [
            { text: 'Great coffee' }, { text: 'Fast service' }, { text: 'Clean place' }
        ],
        rawReviews: mockPlaceDetailsResponse.reviews,
        photosList: mockPlaceDetailsResponse.photos,
        timestamp: '2023-01-01T00:00:00.000Z'
      });
    });

    it('should throw an error if geocoding fails', async () => {
        const geocodeError = { success: false, message: 'Not found' };
        GcpMapsService.geocodeAddress.mockResolvedValue(geocodeError);
  
        await expect(GcpBusinessService.getUnifiedBusinessIntelligence(query)).rejects.toThrow(
          `Unified Business Intelligence failed: Could not geocode the address query: ${query}`
        );
  
        expect(GcpMapsService.getPlaceDetails).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith('Unified Business Intelligence Aggregator Error:', expect.any(Error));
      });

      it('should throw an error if fetching place details fails', async () => {
        const detailsError = { success: false, message: 'Details not found' };
        GcpMapsService.geocodeAddress.mockResolvedValue(mockGeocodeResponse);
        GcpMapsService.getPlaceDetails.mockResolvedValue(detailsError);
  
        await expect(GcpBusinessService.getUnifiedBusinessIntelligence(query)).rejects.toThrow(
          `Unified Business Intelligence failed: Could not fetch Places Details for Place ID: ${mockGeocodeResponse.placeId}`
        );
  
        expect(logger.error).toHaveBeenCalledWith('Unified Business Intelligence Aggregator Error:', expect.any(Error));
      });
  });
});