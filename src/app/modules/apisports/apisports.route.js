import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { ApiSportsController } from './apisports.controller.js';

const router = express.Router();

router.use(auth());

// ═══════════════════════════════════════════════════════════════════════
// SPORTS LIST
// ═══════════════════════════════════════════════════════════════════════

router.get('/sports', ApiSportsController.getSportsList);

// ═══════════════════════════════════════════════════════════════════════
// UNIVERSAL ENDPOINTS — :sport param = football|basketball|baseball|
//   hockey|handball|rugby|volleyball|afl|formula1|mma|nba|nfl
// ═══════════════════════════════════════════════════════════════════════

router.get('/:sport/status', ApiSportsController.getStatus);
router.get('/:sport/timezones', ApiSportsController.getTimezones);
router.get('/:sport/seasons', ApiSportsController.getSeasons);
router.get('/:sport/countries', ApiSportsController.getCountries);
router.get('/:sport/leagues', ApiSportsController.getLeagues);
router.get('/:sport/teams', ApiSportsController.getTeams);
router.get('/:sport/teams/statistics', ApiSportsController.getTeamStatistics);
router.get('/:sport/standings', ApiSportsController.getStandings);

// ═══════════════════════════════════════════════════════════════════════
// FIXTURES / GAMES — LIVE SCORES
// ═══════════════════════════════════════════════════════════════════════

router.get('/:sport/fixtures', ApiSportsController.getFixtures);
router.get('/:sport/fixtures/live', ApiSportsController.getLiveFixtures);
router.get('/:sport/fixtures/h2h', ApiSportsController.getHeadToHead);
router.get('/:sport/fixtures/statistics', ApiSportsController.getFixtureStatistics);
router.get('/:sport/fixtures/events', ApiSportsController.getFixtureEvents);
router.get('/:sport/fixtures/lineups', ApiSportsController.getLineups);

// ═══════════════════════════════════════════════════════════════════════
// PLAYERS
// ═══════════════════════════════════════════════════════════════════════

router.get('/:sport/players', ApiSportsController.getPlayers);
router.get('/:sport/players/squads', ApiSportsController.getSquads);
router.get('/:sport/players/topscorers', ApiSportsController.getTopScorers);

// ═══════════════════════════════════════════════════════════════════════
// ODDS & PREDICTIONS
// ═══════════════════════════════════════════════════════════════════════

router.get('/:sport/odds', ApiSportsController.getOdds);
router.get('/:sport/odds/live', ApiSportsController.getLiveOdds);
router.get('/:sport/predictions', ApiSportsController.getPredictions);
router.get('/:sport/bookmakers', ApiSportsController.getBookmakers);

// ═══════════════════════════════════════════════════════════════════════
// FOOTBALL SPECIFIC
// ═══════════════════════════════════════════════════════════════════════

router.get('/football/coaches', ApiSportsController.getCoaches);
router.get('/football/transfers', ApiSportsController.getTransfers);
router.get('/football/injuries', ApiSportsController.getInjuries);
router.get('/football/venues', ApiSportsController.getVenues);

// ═══════════════════════════════════════════════════════════════════════
// FORMULA 1 SPECIFIC
// ═══════════════════════════════════════════════════════════════════════

router.get('/formula1/circuits', ApiSportsController.getCircuits);
router.get('/formula1/drivers', ApiSportsController.getDrivers);
router.get('/formula1/races', ApiSportsController.getRaces);
router.get('/formula1/rankings/drivers', ApiSportsController.getDriverRankings);

// ═══════════════════════════════════════════════════════════════════════
// MMA SPECIFIC
// ═══════════════════════════════════════════════════════════════════════

router.get('/mma/fighters', ApiSportsController.getFighters);
router.get('/mma/fights', ApiSportsController.getFights);

// ═══════════════════════════════════════════════════════════════════════
// RAW PROXY — catch-all for any sport + any path
//   e.g. GET /api/v1/sports/football/proxy/trophies?player=276
// ═══════════════════════════════════════════════════════════════════════

router.get('/:sport/proxy/*', ApiSportsController.rawProxy);

export const ApiSportsRoutes = router;
export default ApiSportsRoutes;
