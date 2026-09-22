import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { ApiSportsService } from './apisports.service.js';

// ── Sports List ───────────────────────────────────────────────────────

const getSportsList = catchAsync(async (req, res) => {
  const result = ApiSportsService.getSportsList();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Available sports', data: result });
});

// ── Universal Endpoints ───────────────────────────────────────────────

const getStatus = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getStatus(sport);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `${sport} API status`, data: result });
});

const getTimezones = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getTimezones(sport);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Timezones', data: result });
});

const getSeasons = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getSeasons(sport);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Seasons', data: result });
});

const getCountries = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getCountries(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Countries', data: result });
});

const getLeagues = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getLeagues(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Leagues', data: result });
});

const getTeams = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getTeams(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Teams', data: result });
});

const getTeamStatistics = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getTeamStatistics(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Team statistics', data: result });
});

const getStandings = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getStandings(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Standings', data: result });
});

// ── Fixtures / Games ──────────────────────────────────────────────────

const getFixtures = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getFixtures(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Fixtures/Games', data: result });
});

const getLiveFixtures = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getLiveFixtures(sport);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'LIVE scores', data: result });
});

const getHeadToHead = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getHeadToHead(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Head to head', data: result });
});

const getFixtureStatistics = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getFixtureStatistics(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Fixture statistics', data: result });
});

const getFixtureEvents = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getFixtureEvents(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Fixture events', data: result });
});

const getLineups = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getLineups(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Lineups', data: result });
});

// ── Players ───────────────────────────────────────────────────────────

const getPlayers = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getPlayers(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Players', data: result });
});

const getSquads = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getSquads(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Squads', data: result });
});

const getTopScorers = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getTopScorers(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Top scorers', data: result });
});

// ── Odds & Predictions ────────────────────────────────────────────────

const getOdds = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getOdds(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Odds', data: result });
});

const getLiveOdds = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getLiveOdds(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Live odds', data: result });
});

const getPredictions = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getPredictions(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Predictions', data: result });
});

const getBookmakers = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getBookmakers(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Bookmakers', data: result });
});

// ── Football Specific ─────────────────────────────────────────────────

const getCoaches = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getCoaches(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Coaches', data: result });
});

const getTransfers = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getTransfers(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Transfers', data: result });
});

const getInjuries = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getInjuries(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Injuries', data: result });
});

const getVenues = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getVenues(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Venues', data: result });
});

// ── Formula 1 Specific ────────────────────────────────────────────────

const getCircuits = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getCircuits(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Circuits', data: result });
});

const getDrivers = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getDrivers(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Drivers', data: result });
});

const getRaces = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getRaces(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Races', data: result });
});

const getDriverRankings = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getDriverRankings(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Driver rankings', data: result });
});

// ── MMA Specific ──────────────────────────────────────────────────────

const getFighters = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getFighters(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Fighters', data: result });
});

const getFights = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getFights(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Fights', data: result });
});

// ── Additional Football ───────────────────────────────────────────────

const getTrophies = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getTrophies(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Trophies', data: result });
});

const getSidelined = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getSidelined(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Sidelined', data: result });
});

const getTeamSeasons = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getTeamSeasons(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Team seasons', data: result });
});

const getTeamCountries = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getTeamCountries(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Team countries', data: result });
});

// ── Additional Players ────────────────────────────────────────────────

const getPlayerStatistics = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getPlayerStatistics(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Player statistics', data: result });
});

const getTopAssists = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getTopAssists(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Top assists', data: result });
});

const getTopYellowCards = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getTopYellowCards(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Top yellow cards', data: result });
});

const getTopRedCards = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getTopRedCards(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Top red cards', data: result });
});

// ── Additional Fixtures ───────────────────────────────────────────────

const getFixtureRounds = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getFixtureRounds(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Fixture rounds', data: result });
});

const getFixturePlayers = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getFixturePlayers(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Fixture players', data: result });
});

// ── Additional Odds ───────────────────────────────────────────────────

const getOddsMapping = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getOddsMapping(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Odds mapping', data: result });
});

const getBetTypes = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = await ApiSportsService.getBetTypes(sport, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Bet types', data: result });
});

// ── Additional F1 ─────────────────────────────────────────────────────

const getTeamRankings = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getTeamRankings(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'F1 team rankings', data: result });
});

const getRaceRankings = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getRaceRankings(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'F1 race rankings', data: result });
});

const getPitStops = catchAsync(async (req, res) => {
  const result = await ApiSportsService.getPitStops(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'F1 pit stops', data: result });
});

// ── Live Score Streaming Controls ─────────────────────────────────────

const startLivePolling = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const intervalMs = parseInt(req.query.interval) || 30000;
  ApiSportsService.startLivePolling(sport, intervalMs);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Live polling started for ${sport}`, data: { sport, intervalMs } });
});

const stopLivePolling = catchAsync(async (req, res) => {
  const { sport } = req.params;
  ApiSportsService.stopLivePolling(sport);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Live polling stopped for ${sport}`, data: { sport } });
});

const startAllLivePolling = catchAsync(async (req, res) => {
  const intervalMs = parseInt(req.query.interval) || 30000;
  ApiSportsService.startAllLivePolling(intervalMs);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Live polling started for ALL sports', data: { intervalMs } });
});

const getCachedLiveScores = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const result = ApiSportsService.getCachedLiveScores(sport);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Cached live scores: ${sport}`, data: result });
});

const getAllCachedLiveScores = catchAsync(async (req, res) => {
  const result = ApiSportsService.getAllCachedLiveScores();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'All cached live scores', data: result });
});

// ── Generic Proxy ─────────────────────────────────────────────────────

const rawProxy = catchAsync(async (req, res) => {
  const { sport } = req.params;
  const path = '/' + req.params[0];
  const result = await ApiSportsService.rawGet(sport, path, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `${sport} proxy: ${path}`, data: result });
});

export const ApiSportsController = {
  getSportsList,
  getStatus, getTimezones, getSeasons, getCountries, getLeagues, getTeams, getTeamStatistics, getStandings,
  getFixtures, getLiveFixtures, getHeadToHead, getFixtureStatistics, getFixtureEvents, getLineups,
  getPlayers, getSquads, getTopScorers,
  getOdds, getLiveOdds, getPredictions, getBookmakers,
  getCoaches, getTransfers, getInjuries, getVenues,
  getCircuits, getDrivers, getRaces, getDriverRankings,
  getFighters, getFights,
  getTrophies, getSidelined, getTeamSeasons, getTeamCountries,
  getPlayerStatistics, getTopAssists, getTopYellowCards, getTopRedCards,
  getFixtureRounds, getFixturePlayers,
  getOddsMapping, getBetTypes,
  getTeamRankings, getRaceRankings, getPitStops,
  startLivePolling, stopLivePolling, startAllLivePolling,
  getCachedLiveScores, getAllCachedLiveScores,
  rawProxy,
};

export default ApiSportsController;
