import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { GcpMapsService } from './gcp-maps.service.js';

vi.mock('axios');
vi.mock('../../../../config/index.js', () => ({
  default: {
    google_search_api_key: 'config-api-key'
  }
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('GcpMapsService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Reset config key to default mock value
    config.google_search_api_key = 'config-api-key';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('API Key Resolution (getApiKey)', () => {
    it('should prioritize GOOGLE_MAPS_API_KEY over others', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'google-maps-env-key';
      process.env.MAPS_API_KEY = 'maps-env-key';
      config.google_search_api_key = 'config-key';

      axios.get.mockResolvedValueOnce({ data: { status: 'OK', results: [{}] } });
      await GcpMapsService.geocodeAddress('Test Address');

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ key: 'google-maps-env-key' })
        })
      );
    });

    it('should fallback to MAPS_API_KEY if GOOGLE_MAPS_API_KEY is missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      process.env.MAPS_API_KEY = 'maps-env-key';
      config.google_search_api_key = 'config-key';

      axios.get.mockResolvedValueOnce({ data: { status: 'OK', results: [{}] } });
      await GcpMapsService.geocodeAddress('Test Address');

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ key: 'maps-env-key' })
        })
      );
    });

    it('should fallback to config.google_search_api_key if both env vars are missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      delete process.env.MAPS_API_KEY;
      config.google_search_api_key = 'config-key';

      axios.get.mockResolvedValueOnce({ data: { status: 'OK', results: [{}] } });
      await GcpMapsService.geocodeAddress('Test Address');

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ key: 'config-key' })
        })
      );
    });

    it('should throw an error if no API key is configured', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      delete process.env.MAPS_API_KEY;
      config.google_search_api_key = undefined;

      await expect(GcpMapsService.geocodeAddress('Test Address')).rejects.toThrow(
        'Maps Geocoding failed: Google Maps API Key is not configured. Please set GOOGLE_MAPS_API_KEY.'
      );
    });
  });

  describe('geocodeAddress', () => {
    it('should successfully geocode an address', async () => {
      const mockResponse = {
        data: {
          status: 'OK',
          results: [
            {
              formatted_address: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA',
              geometry: {
                location: { lat: 37.4224764, lng: -122.0842499 }
              },
              place_id: 'ChIJ2eUgeAK6j4ARbn5u_w7t3gM',
              types: ['street_address'],
              address_components: [
                { long_name: '1600', short_name: '1600', types: ['street_number'] }
              ]
            }
          ]
        }
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      const result = await GcpMapsService.geocodeAddress('1600 Amphitheatre Pkwy');

      expect(result).toEqual({
        success: true,
        formattedAddress: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA',
        location: { lat: 37.4224764, lng: -122.0842499 },
        placeId: 'ChIJ2eUgeAK6j4ARbn5u_w7t3gM',
        types: ['street_address'],
        addressComponents: [
          { long_name: '1600', short_name: '1600', types: ['street_number'] }
        ]
      });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Geocoding address'));
    });

    it('should throw an error if Google API returns a non-OK status', async () => {
      const mockResponse = {
        data: {
          status: 'ZERO_RESULTS',
          error_message: 'No results found'
        }
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      await expect(GcpMapsService.geocodeAddress('Invalid Address')).rejects.toThrow(
        'Maps Geocoding failed: Google Maps Geocoding failed with status: ZERO_RESULTS - No results found'
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should fallback to default error message if error_message is missing in non-OK status', async () => {
      const mockResponse = {
        data: {
          status: 'OVER_QUERY_LIMIT'
        }
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      await expect(GcpMapsService.geocodeAddress('Any Address')).rejects.toThrow(
        'Maps Geocoding failed: Google Maps Geocoding failed with status: OVER_QUERY_LIMIT - No additional details'
      );
    });

    it('should handle network or axios errors gracefully', async () => {
      axios.get.mockRejectedValueOnce(new Error('Network Error'));

      await expect(GcpMapsService.geocodeAddress('Any Address')).rejects.toThrow(
        'Maps Geocoding failed: Network Error'
      );
    });
  });

  describe('searchNearbyPlaces', () => {
    it('should successfully search nearby places with default parameters', async () => {
      const mockResponse = {
        data: {
          status: 'OK',
          results: [
            {
              name: 'Googleplex',
              vicinity: '1600 Amphitheatre Pkwy, Mountain View',
              geometry: {
                location: { lat: 37.422, lng: -122.084 }
              },
              place_id: 'ChIJ2eUgeAK6j4ARbn5u_w7t3gM',
              rating: 4.5,
              types: ['establishment', 'point_of_interest'],
              opening_hours: { open_now: true }
            }
          ]
        }
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      const result = await GcpMapsService.searchNearbyPlaces(37.422, -122.084);

      expect(result).toEqual({
        success: true,
        location: { latitude: 37.422, longitude: -122.084 },
        radius: 5000,
        keyword: '',
        places: [
          {
            name: 'Googleplex',
            formattedAddress: '1600 Amphitheatre Pkwy, Mountain View',
            location: { lat: 37.422, lng: -122.084 },
            placeId: 'ChIJ2eUgeAK6j4ARbn5u_w7t3gM',
            rating: 4.5,
            types: ['establishment', 'point_of_interest'],
            openNow: true
          }
        ]
      });
      expect(axios.get).toHaveBeenCalledWith(
        'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
        {
          params: {
            location: '37.422,-122.084',
            radius: 5000,
            key: 'config-api-key'
          }
        }
      );
    });

    it('should include keyword in params if provided', async () => {
      axios.get.mockResolvedValueOnce({ data: { status: 'OK', results: [] } });

      await GcpMapsService.searchNearbyPlaces(37.422, -122.084, 2000, 'coffee');

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            keyword: 'coffee',
            radius: 2000
          })
        })
      );
    });

    it('should handle ZERO_RESULTS status as a successful empty list', async () => {
      const mockResponse = {
        data: {
          status: 'ZERO_RESULTS',
          results: []
        }
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      const result = await GcpMapsService.searchNearbyPlaces(37.422, -122.084);

      expect(result.success).toBe(true);
      expect(result.places).toEqual([]);
    });

    it('should throw an error if API key is missing', async () => {
      config.google_search_api_key = undefined;

      await expect(GcpMapsService.searchNearbyPlaces(37.422, -122.084)).rejects.toThrow(
        'Maps Places Search failed: Google Maps API Key is not configured.'
      );
    });

    it('should throw an error if Google API returns a non-OK/ZERO_RESULTS status', async () => {
      const mockResponse = {
        data: {
          status: 'INVALID_REQUEST',
          error_message: 'The sensor parameter is required.'
        }
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      await expect(GcpMapsService.searchNearbyPlaces(37.422, -122.084)).rejects.toThrow(
        'Maps Places Search failed: Google Maps Places Search failed with status: INVALID_REQUEST - The sensor parameter is required.'
      );
    });
  });

  describe('calculateRoute', () => {
    it('should successfully calculate driving route', async () => {
      const mockResponse = {
        data: {
          status: 'OK',
          routes: [
            {
              legs: [
                {
                  start_address: 'Paris, France',
                  end_address: 'Lyon, France',
                  distance: { text: '460 km', value: 460000 },
                  duration: { text: '4 hours 15 mins', value: 15300 },
                  steps: [
                    {
                      html_instructions: 'Head <b>north</b> on <b>Rue de Rivoli</b>',
                      distance: { text: '0.1 km' },
                      duration: { text: '1 min' },
                      start_location: { lat: 48.8566, lng: 2.3522 },
                      end_location: { lat: 48.8576, lng: 2.3522 }
                    }
                  ]
                }
              ]
            }
          ]
        }
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      const result = await GcpMapsService.calculateRoute('Paris, France', 'Lyon, France');

      expect(result).toEqual({
        success: true,
        origin: 'Paris, France',
        destination: 'Lyon, France',
        distance: '460 km',
        distanceValueBytes: 460000,
        duration: '4 hours 15 mins',
        durationValueSeconds: 15300,
        steps: [
          {
            instruction: 'Head north on Rue de Rivoli',
            distance: '0.1 km',
            duration: '1 min',
            startLocation: { lat: 48.8566, lng: 2.3522 },
            endLocation: { lat: 48.8576, lng: 2.3522 }
          }
        ]
      });
    });

    it('should handle missing steps or distance/duration values gracefully', async () => {
      const mockResponse = {
        data: {
          status: 'OK',
          routes: [
            {
              legs: [
                {
                  start_address: 'A',
                  end_address: 'B',
                  steps: [
                    {
                      start_location: { lat: 1, lng: 1 },
                      end_location: { lat: 2, lng: 2 }
                    }
                  ]
                }
              ]
            }
          ]
        }
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      const result = await GcpMapsService.calculateRoute('A', 'B');

      expect(result.steps[0].instruction).toBe('');
      expect(result.steps[0].distance).toBe('');
      expect(result.steps[0].duration).toBe('');
      expect(result.distanceValueBytes).toBe(0);
      expect(result.durationValueSeconds).toBe(0);
    });

    it('should throw an error if API key is missing', async () => {
      config.google_search_api_key = undefined;

      await expect(GcpMapsService.calculateRoute('A', 'B')).rejects.toThrow(
        'Maps Directions failed: Google Maps API Key is not configured.'
      );
    });

    it('should throw an error if Google API returns a non-OK status', async () => {
      const mockResponse = {
        data: {
          status: 'NOT_FOUND',
          error_message: 'At least one of the locations specified in the request could not be geocoded.'
        }
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      await expect(GcpMapsService.calculateRoute('A', 'B')).rejects.toThrow(
        'Maps Directions failed: Google Maps Directions failed with status: NOT_FOUND'
      );
    });
  });

  describe('getPlaceDetails', () => {
    it('should successfully retrieve place details', async () => {
      const mockResponse = {
        data: {
          status: 'OK',
          result: {
            name: 'Eiffel Tower',
            place_id: 'ChIJLU7jZClu5kcRmA9AYBcZ65o',
            formatted_address: 'Champ de Mars, 5 Avenue Anatole France, 75007 Paris, France',
            formatted_phone_number: '08 92 70 12 39',
            international_phone_number: '+33 892 70 12 39',
            geometry: {
              location: { lat: 48.85837009999999, lng: 2.2944813 }
            },
            rating: 4.7,
            user_ratings_total: 320000,
            website: 'https://www.toureiffel.paris/fr',
            price_level: 2,
            business_status: 'OPERATIONAL',
            opening_hours: {
              open_now: true,
              weekday_text: ['Monday: 9:30 AM – 10:45 PM']
            },
            reviews: [
              {
                author_name: 'John Doe',
                rating: 5,
                text: 'Amazing experience!',
                relative_time_description: 'a week ago',
                time: 1620000000
              }
            ],
            photos: [
              {
                photo_reference: 'photo_ref_123',
                height: 1000,
                width: 1600
              }
            ]
          }
        }
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      const result = await GcpMapsService.getPlaceDetails('ChIJLU7jZClu5kcRmA9AYBcZ65o');

      expect(result).toEqual({
        success: true,
        name: 'Eiffel Tower',
        placeId: 'ChIJLU7jZClu5kcRmA9AYBcZ65o',
        formattedAddress: 'Champ de Mars, 5 Avenue Anatole France, 75007 Paris, France',
        phoneNumber: '08 92 70 12 39',
        internationalPhoneNumber: '+33 892 70 12 39',
        location: { lat: 48.85837009999999, lng: 2.2944813 },
        rating: 4.7,
        user_ratings_total: 320000,
        website: 'https://www.toureiffel.paris/fr',
        priceLevel: 2,
        businessStatus: 'OPERATIONAL',
        openNow: true,
        weekdayText: ['Monday: 9:30 AM – 10:45 PM'],
        reviews: [
          {
            authorName: 'John Doe',
            rating: 5,
            text: 'Amazing experience!',
            relativeTime: 'a week ago',
            time: 1620000000
          }
        ],
        photos: [
          {
            photoReference: 'photo_ref_123',
            height: 1000,
            width: 1600
          }
        ]
      });
    });

    it('should handle missing optional fields in place details response', async () => {
      const mockResponse = {
        data: {
          status: 'OK',
          result: {
            // Minimal fields
          }
        }
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      const result = await GcpMapsService.getPlaceDetails('some-id');

      expect(result).toEqual({
        success: true,
        name: '',
        placeId: 'some-id',
        formattedAddress: '',
        phoneNumber: '',
        internationalPhoneNumber: '',
        location: undefined,
        rating: undefined,
        userRatingsTotal: undefined,
        website: '',
        priceLevel: undefined,
        businessStatus: 'OPERATIONAL',
        openNow: undefined,
        weekdayText: [],
        reviews: [],
        photos: []
      });
    });

    it('should throw an error if API key is missing', async () => {
      config.google_search_api_key = undefined;

      await expect(GcpMapsService.getPlaceDetails('some-id')).rejects.toThrow(
        'Maps Place Details failed: Google Maps API Key is not configured.'
      );
    });

    it('should throw an error if Google API returns a non-OK status', async () => {
      const mockResponse = {
        data: {
          status: 'INVALID_REQUEST',
          error_message: 'The passed Place ID is invalid.'
        }
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      await expect(GcpMapsService.getPlaceDetails('invalid-id')).rejects.toThrow(
        'Maps Place Details failed: Google Maps Place Details failed with status: INVALID_REQUEST'
      );
    });
  });

  describe('getPlacePhotoUrl', () => {
    it('should successfully generate photo URL with default width', () => {
      const result = GcpMapsService.getPlacePhotoUrl('photo_ref_abc');

      expect(result).toEqual({
        success: true,
        photoReference: 'photo_ref_abc',
        maxWidth: 800,
        photoUrl: 'https://maps.googleapis.com/maps/api/place/photo?photo_reference=photo_ref_abc&maxwidth=800&key=config-api-key'
      });
    });

    it('should successfully generate photo URL with custom width', () => {
      const result = GcpMapsService.getPlacePhotoUrl('photo_ref_abc', 1200);

      expect(result.maxWidth).toBe(1200);
      expect(result.photoUrl).toContain('maxwidth=1200');
    });

    it('should throw an error if API key is missing', () => {
      config.google_search_api_key = undefined;

      expect(() => GcpMapsService.getPlacePhotoUrl('photo_ref_abc')).toThrow(
        'Google Maps API Key is not configured.'
      );
    });
  });
});