import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { AviationStackService } from './aviationstack.service.js';

const getFlights = catchAsync(async (req, res) => {
  const result = await AviationStackService.getFlights(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Flights', data: result });
});

const getLiveFlights = catchAsync(async (req, res) => {
  const result = await AviationStackService.getLiveFlights(req.query.status || 'active');
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Live flights', data: result });
});

const getFlightsByDeparture = catchAsync(async (req, res) => {
  const result = await AviationStackService.getFlightsByDeparture(req.params.iata, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Departures: ${req.params.iata}`, data: result });
});

const getFlightsByArrival = catchAsync(async (req, res) => {
  const result = await AviationStackService.getFlightsByArrival(req.params.iata, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Arrivals: ${req.params.iata}`, data: result });
});

const getFlightByNumber = catchAsync(async (req, res) => {
  const result = await AviationStackService.getFlightByNumber(req.params.flightIata, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Flight: ${req.params.flightIata}`, data: result });
});

const getFutureFlights = catchAsync(async (req, res) => {
  const result = await AviationStackService.getFutureFlights(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Future flights', data: result });
});

const getTimetable = catchAsync(async (req, res) => {
  const result = await AviationStackService.getTimetable(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Timetable', data: result });
});

const getAirports = catchAsync(async (req, res) => {
  const result = await AviationStackService.getAirports(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Airports', data: result });
});

const getAirlines = catchAsync(async (req, res) => {
  const result = await AviationStackService.getAirlines(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Airlines', data: result });
});

const getAirplanes = catchAsync(async (req, res) => {
  const result = await AviationStackService.getAirplanes(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Airplanes', data: result });
});

const getAircraftTypes = catchAsync(async (req, res) => {
  const result = await AviationStackService.getAircraftTypes(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Aircraft types', data: result });
});

const getCities = catchAsync(async (req, res) => {
  const result = await AviationStackService.getCities(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Cities', data: result });
});

const getCountries = catchAsync(async (req, res) => {
  const result = await AviationStackService.getCountries(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Countries', data: result });
});

const getRoutes = catchAsync(async (req, res) => {
  const result = await AviationStackService.getRoutes(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Routes', data: result });
});

const getAviationTaxes = catchAsync(async (req, res) => {
  const result = await AviationStackService.getAviationTaxes(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Aviation taxes', data: result });
});

const rawProxy = catchAsync(async (req, res) => {
  const path = '/' + req.params[0];
  const result = await AviationStackService.rawGet(path, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Proxy: ${path}`, data: result });
});

export const AviationStackController = {
  getFlights, getLiveFlights, getFlightsByDeparture, getFlightsByArrival, getFlightByNumber,
  getFutureFlights, getTimetable,
  getAirports, getAirlines, getAirplanes, getAircraftTypes,
  getCities, getCountries, getRoutes, getAviationTaxes,
  rawProxy,
};

export default AviationStackController;
