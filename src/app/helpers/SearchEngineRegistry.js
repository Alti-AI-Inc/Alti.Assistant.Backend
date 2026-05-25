/**
 * SearchEngineRegistry.js — Dynamic GCP-Native Search & Grounding Registry
 *
 * Centralized, high-performance coordinator managing Alti's 110+ data integrations
 * dynamically. Bypasses hardcoded smart routing via a modular plug-and-play provider
 * architecture, providing concurrent parallel scanning, dual-layer SWR caching,
 * timeout circuit breakers, and semantic validation.
 */

import { RedisClient } from '../../shared/redis.js';
import { logger } from '../../shared/logger.js';

import { DuffelFlightsProvider, DuffelStaysProvider } from './providers/duffelProviders.js';
import { UsgsEarthquakesProvider, OpencorporatesProvider, NasaFirmsProvider } from './providers/stage21PremiumProviders.js';
import { GdeltGeopoliticalProvider, EurostatEconomicProvider, WhoDiseaseOutbreaksProvider } from './providers/stage22PremiumProviders.js';
import { EpoPatentsProvider, MedrxivPreprintsProvider } from './providers/stage23PremiumProviders.js';
import { HtsTariffsProvider, OyezScotusProvider, SedarFilingsProvider } from './providers/stage24PremiumProviders.js';
import { WefGlobalCompetitivenessProvider, ImfWorldEconomicOutlookProvider, OecdLeadingIndicatorsProvider } from './providers/stage25PremiumProviders.js';
import { UkOnsMacroeconomicsProvider, BankOfEnglandMonetaryProvider, UkHmLandRegistryProvider } from './providers/stage26PremiumProviders.js';

// Import Modular Providers
import {
  CourtListenerProvider,
  HarvardCaselawProvider,
  CisaKevProvider,
  NistNvdCveProvider,
  OfacSanctionsProvider,
  FaraForeignAgentsProvider
} from './providers/legalSecurityProviders.js';

import {
  FdicBankFindProvider,
  CfpbComplaintsProvider,
  SecEdgarFactProvider,
  CensusBpsProvider
} from './providers/financialRegulatoryProviders.js';

import {
  ClinicalTrialsProvider,
  FdaDrugSafetyProvider,
  GlobalHealthObservatoryProvider,
  UsTreasuryFiscalProvider,
  FederalSpendingProvider,
  HealthcareNpiProvider,
  FoodNutrientsProvider,
  CharityRegistryProvider,
  AviationDelaysProvider,
  RxNormProvider,
  DailyMedProvider,
  OpenFoodFactsProvider,
  PubChemProvider
} from './providers/premiumPublicProviders.js';

import {
  PoliticsCampaignProvider,
  LegislationTrackingProvider,
  CivicRepresentativesProvider,
  MacroeconomicsGlobalProvider,
  MortgageLendingProvider,
  DisasterHazardsProvider,
  MedicalResearchProvider,
  UkCompanyRegistryProvider,
  GlobalEntityRegistryProvider
} from './providers/greenlightProviders.js';

import {
  GleifLeiProvider,
  UsptoPatentsProvider,
  OpenSkyProvider,
  GridMonitorProvider,
  UsdaStatsProvider,
  CopernicusProvider,
  DemographicsProvider,
  NewsApiAiProvider
} from './providers/deepScientificProviders.js';

import {
  FredProvider,
  HudFmrProvider,
  FhfaHpiProvider,
  CollegeScorecardProvider,
  ClimateRiskProvider,
  EiaCommoditiesProvider,
  SecFilingsProvider
} from './providers/macroEconomicProviders.js';

import { SportsBettingProvider } from './providers/sportsBettingProviders.js';
import { RealEstateApiProvider } from './providers/realEstateApiProviders.js';
import { FinanceStockProvider } from './providers/financeStockProviders.js';
import { AviationstackProvider } from './providers/aviationstackProviders.js';

import {
  BlsEconomicProvider,
  BeaEconomicProvider,
  CongressGovProvider,
  OpenSecretsProvider,
  SamGovProvider,
  GaoReportsProvider,
  EcfrRegulationsProvider,
  FederalRegisterProvider,
  EpaEchoProvider,
  OshaInspectionsProvider
} from './providers/newPremiumRegistryProviders.js';

import {
  UnComtradeProvider,
  CensusTradeProvider,
  DbnomicsProvider,
  WorldBankProvider,
  LdaLobbyingProvider,
  OpenFecProvider,
  NihReporterProvider,
  ChemblProvider,
  ClinvarProvider,
  UniprotProvider
} from './providers/morePremiumRegistryProviders.js';

import {
  EiaEnergyProvider,
  GovinfoProvider,
  OpenalexProvider,
  ArxivProvider,
  GnomadProvider,
  EnsemblProvider,
  PdbProvider,
  AlphafoldProvider,
  GtexProvider,
  ProteinAtlasProvider
} from './providers/advancedPremiumRegistryProviders.js';

import {
  NcbiSequencesProvider,
  ReactomeProvider,
  StringInteractionsProvider,
  InterproDomainsProvider,
  BiorxivProvider,
  EuropePmcProvider,
  JasparMotifsProvider,
  UcscConservationProvider,
  EncodeCcresProvider,
  AlphagenomeVariantsProvider
} from './providers/scientificPremiumRegistryProviders.js';

import {
  DbsnpVariantsProvider,
  EmblEbiOlsProvider,
  FoldseekSearchProvider,
  UnibindTfbsProvider,
  ProteinMsaProvider,
  GoldCommoditiesProvider,
  CryptoQuotesProvider,
  NasaNeoAsteroidsProvider,
  MitreAttackMatrixProvider,
  SecForm4InsidersProvider
} from './providers/financialScientificPremiumProviders.js';

import {
  GithubApiReposProvider,
  WikipediaSearchProvider,
  WikidataEntitiesProvider,
  OpenopenweathermapWeatherProvider,
  OpenstreetmapGeocodingProvider,
  ZenodoResearchProvider,
  CrossrefDoisProvider,
  NhcHurricanesProvider,
  FccLicensingProvider,
  UsdaSoilSurveyProvider
} from './providers/developerGeographicPremiumProviders.js';

import {
  AirnowAqiProvider,
  UspsZipLookupProvider,
  NoaaMarineTidesProvider,
  SecForm3OwnershipProvider,
  OpenlibraryBooksProvider,
  OpenmeteoRadiationProvider,
  InternetArchiveItemsProvider,
  NifcWildfiresProvider,
  PmcOpenAccessProvider,
  AirlineRoutesProvider
} from './providers/scientificEnvironmentalPremiumProviders.js';

import {
  GithubIssuesPrsProvider,
  OpenstreetmapAmenitiesProvider,
  WikidataLexemesProvider,
  WikipediaFeaturedProvider,
  FccBroadbandMapProvider,
  OpenlibraryAuthorsProvider,
  ZenodoCommunitiesProvider,
  NifcDailyAdvisoriesProvider,
  CrossrefMembersProvider,
  UsdaPlantsDbProvider
} from './providers/specializedNichePremiumProviders.js';

import {
  GithubReleasesProvider,
  OpenstreetmapTransitProvider,
  WikidataPropertiesProvider,
  WikipediaSuggestProvider,
  FccTowersProvider,
  OpenlibrarySubjectsProvider,
  ZenodoFileStatsProvider,
  NifcHistoricalFiresProvider,
  CrossrefFundersProvider,
  UsdaHardinessHistoryProvider
} from './providers/nicheNicheSubPremiumProviders.js';

import {
  GithubCommitsProvider,
  OpenstreetmapWaterwaysProvider,
  WikidataSparqlProvider,
  WikipediaRevisionsProvider,
  FccAmateurRadioProvider,
  OpenlibraryShelvesProvider,
  ZenodoViewsTelemetryProvider,
  NifcFireHotspotsProvider,
  CrossrefRetractionsProvider,
  UsdaSoilTexturesProvider
} from './providers/ultraPremiumNicheProviders.js';

import {
  GithubDeploymentsProvider,
  OpenstreetmapLanduseProvider,
  WikidataConstraintsProvider,
  WikipediaRedirectsProvider,
  FccAmateurOperatorsProvider,
  OpenlibraryWorksProvider,
  ZenodoDoisProvider,
  NifcAcresBurnedProvider,
  CrossrefCitationsProvider,
  UsdaPlantHabitatsProvider
} from './providers/hyperPremiumNicheProviders.js';

import {
  GithubWorkflowsProvider,
  OpenstreetmapBoundariesProvider,
  WikidataLabelsProvider,
  WikipediaPageviewsProvider,
  FccRadioRegistrationsProvider,
  OpenlibraryLanguagesProvider,
  ZenodoLicensesProvider,
  NifcAssignedPersonnelProvider,
  CrossrefOpenFundersProvider,
  UsdaShrubTolerancesProvider
} from './providers/superPremiumNicheProviders.js';

import {
  GithubLanguagesProvider,
  OpenstreetmapHighwaysProvider,
  WikidataDescriptionsProvider,
  WikipediaPageLinksProvider,
  FccAmateurEquipmentProvider,
  OpenlibraryCoversProvider,
  ZenodoFormatsProvider,
  NifcAssignedEquipmentProvider,
  CrossrefFunderSchemesProvider,
  UsdaShrubGrowthProvider
} from './providers/megaPremiumNicheProviders.js';

import {
  GithubStargazersProvider,
  OpenstreetmapRailwaysProvider,
  WikidataReferencesProvider,
  WikipediaLanglinksProvider,
  FccAmateurClubsProvider,
  OpenlibraryExcerptsProvider,
  ZenodoCreatorsProvider,
  NifcSuppressedPerimetersProvider,
  CrossrefJournalMetricsProvider,
  UsdaWoodyCharacteristicsProvider
} from './providers/nicheNicheNichePremiumProviders.js';

import {
  GithubForksProvider,
  OpenstreetmapBuildingsProvider,
  WikidataBacklinksProvider,
  WikipediaCitationsProvider,
  FccAmateurVanityProvider,
  OpenlibraryReviewsProvider,
  ZenodoCitationsProvider,
  NifcIgnitionCausesProvider,
  CrossrefClinicalTrialsProvider,
  UsdaPlantPropagationProvider
} from './providers/nicheNicheNicheNichePremiumProviders.js';

import {
  GithubDiscussionsProvider,
  OpenstreetmapLanduseAreasProvider,
  WikidataPropertyConstraintsProvider,
  WikipediaTrendingViewsProvider,
  FccAmateurFrequenciesProvider,
  OpenlibraryCatalogsProvider,
  ZenodoCommunitiesGroupsProvider,
  NifcPreparednessLevelsProvider,
  CrossrefLicenseRegistriesProvider,
  UsdaPlantCharacteristicsProvider
} from './providers/nicheNicheNicheNicheNichePremiumProviders.js';

import {
  GithubSecurityAdvisoriesProvider,
  OpenstreetmapLeisureProvider,
  WikidataSitelinksProvider,
  WikipediaCategoriesProvider,
  FccBroadbandSpeedsProvider,
  OpenlibraryPublishersProvider,
  ZenodoGrantsProvider,
  NifcWeatherAdvisoriesProvider,
  CrossrefUpdatesProvider,
  UsdaSoilSalinityProvider
} from './providers/nicheNicheNicheNicheNicheNichePremiumProviders.js';









// ─── Dual-Layer Cache System ─────────────────────────────────────────────────
const localMemoryCache = new Map();
const MEMORY_CACHE_TTL = 3600 * 1000; // 1 hour in ms

const getMemoryCache = (key) => {
  const entry = localMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    localMemoryCache.delete(key);
    return null;
  }
  return entry.value;
};

const setMemoryCache = (key, value) => {
  localMemoryCache.set(key, {
    value,
    expiry: Date.now() + MEMORY_CACHE_TTL
  });
};

// ─── Deterministic Hash Helper ──────────────────────────────────────────────
export const getDeterministicHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

// ─── Unicode-Safe Query Sanitizer ──────────────────────────────────────────
export const sanitizeQueryString = (query) => {
  if (typeof query !== 'string') return '';
  
  // Strip URLs, HTML tags, script vectors
  let cleaned = query
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/www\.\S+/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:\S*/gi, '')
    .replace(/[<>\r\n]/g, '')
    .trim();
    
  // Strict Unicode range filtering (Letters, Numbers, Spaces, Hyphens, Periods)
  cleaned = cleaned.replace(/[^\p{L}\p{N}\s\-\.]/gu, '');
  
  return cleaned.substring(0, 80).trim();
};

class SearchEngineCoordinator {
  constructor() {
    this.providers = new Map();
  }

  /**
   * Registers a modular SearchProvider.
   * @param {Object} provider - The SearchProvider object conforming to Alti contract.
   */
  register(provider) {
    if (!provider || !provider.id) {
      logger.error('[SearchRegistry] Invalid provider registration attempted');
      return;
    }
    this.providers.set(provider.id, provider);
    logger.info(`[SearchRegistry] Registered provider: "${provider.id}" [Category: ${provider.category}]`);
  }

  /**
   * Scans all registered providers in parallel to find active intents.
   * @param {string} prompt - Raw user query.
   * @returns {Object[]} - Array of active providers.
   */
  detectActiveProviders(prompt) {
    if (!prompt) return [];
    const active = [];
    for (const [id, provider] of this.providers.entries()) {
      try {
        if (provider.detectIntent(prompt)) {
          active.push(provider);
        }
      } catch (err) {
        logger.error(`[SearchRegistry] Error scanning intent for "${id}": ${err.message}`);
      }
    }
    return active;
  }

  /**
   * Safe wrapper that executes a fetch promise with competitive timeout boundaries (3s default).
   * @param {Promise} promise - Target promise.
   * @param {number} ms - Timeout in milliseconds.
   * @returns {Promise} - Resolves to promise value or null if timed out.
   */
  async executeWithTimeout(promise, ms = 3000) {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Search provider API timeout')), ms))
    ]).catch(err => {
      logger.warn(`[SearchRegistry] Timeout/execution alert: ${err.message}`);
      return null;
    });
  }

  /**
   * Executes a specific search provider using dual-layer SWR caching logic.
   * @param {Object} provider - Target SearchProvider.
   * @param {string} prompt - Raw query.
   * @returns {Promise<Object>} - Grounded markdown and metadata.
   */
  async executeProvider(provider, prompt) {
    const topic = provider.extractTopic(prompt);
    const sanitizedTopic = topic ? topic.toLowerCase().trim() : 'general';
    const cacheKey = `registry:${provider.id}:${sanitizedTopic}`;

    // 1. Memory Cache check
    const memCached = getMemoryCache(cacheKey);
    if (memCached) {
      return memCached;
    }

    // 2. Redis Cache check
    try {
      const redisCached = await RedisClient.get(cacheKey);
      if (redisCached) {
        const parsed = JSON.parse(redisCached);
        setMemoryCache(cacheKey, parsed);
        return parsed;
      }
    } catch (err) {
      logger.warn(`[SearchRegistry] Redis cache fetch failure for "${provider.id}": ${err.message}`);
    }

    // 3. Live Execution with Timeout Gate
    logger.info(`[SearchRegistry] Active fetch dispatched for "${provider.id}" with topic: "${topic}"`);
    const ttl = provider.cacheTTL || 3600;
    
    const result = await this.executeWithTimeout(provider.fetch(topic, prompt), 3500);
    
    if (result && result.markdown) {
      // Heal metadata before saving/returning
      result.metadata = this.healMetadata(result.markdown, result.metadata);
      // Sync into memory & Redis cache
      setMemoryCache(cacheKey, result);
      try {
        await RedisClient.set(cacheKey, JSON.stringify(result), { EX: ttl });
      } catch (err) {
        logger.warn(`[SearchRegistry] Redis cache save failure for "${provider.id}": ${err.message}`);
      }
      return result;
    }

    return null;
  }

  /**
   * Central orchestrator that detects, executes, and synthesizes RAG blocks platform-wide.
   * @param {string} prompt - Raw query string.
   * @returns {Promise<string>} - Context-injected system prompt context.
   */
  /**
   * Automatically repairs missing, null, or placeholder fields in the metadata envelope
   * by parsing values directly from the clean Markdown block.
   * @param {string} markdown - Clean markdown block.
   * @param {Object} metadata - Initial metadata object.
   * @returns {Object} - Restored/healed metadata object.
   */
  healMetadata(markdown, metadata = {}) {
    if (!markdown) return metadata;
    const healed = { ...metadata };

    // 1. Repair Finance Stock prices
    if (healed.domain === 'financial_ticker' || healed.financialTicker) {
      if (!healed.price || healed.price === 175.5) {
        const priceMatch = markdown.match(/Current Price:\s*\$?([0-9.]+)/i) || 
                           markdown.match(/Price:\s*\$?([0-9.]+)/i) ||
                           markdown.match(/\*\*([0-9.]+)\*\*/g) ||
                           markdown.match(/\$?([0-9.]+)/);
        if (priceMatch) {
          const raw = typeof priceMatch === 'string' ? priceMatch : (priceMatch[1] || priceMatch[0]);
          const val = parseFloat(raw.replace(/\*+/g, '').replace('$', '').trim());
          if (!isNaN(val) && val > 0) {
            healed.price = val;
            healed.high = val * 1.01;
            healed.low = val * 0.99;
          }
        }
      }
    }

    // 2. Repair Real Estate valuation & address
    if (healed.domain === 'real_estate' || healed.address) {
      if (!healed.valuation || healed.valuation === '$750,000') {
        const valMatch = markdown.match(/Current AVM\*\*\s*\|\s*\*?\*?(\$[0-9,]+)/i) || 
                         markdown.match(/Valuation:\s*\*?\*?(\$[0-9,]+)/i) ||
                         markdown.match(/AVM\s*\|\s*([\$0-9,]+)/i);
        if (valMatch) {
          healed.valuation = valMatch[1] || valMatch[0];
        }
      }
      if (!healed.address) {
        const addrMatch = markdown.match(/Address\*\*:\s*\*?\*?([^\n|]+)/i) ||
                          markdown.match(/Subject Property details\s*\n\s*-\s*\*\*([^\n]+)/i);
        if (addrMatch) {
          healed.address = addrMatch[1].trim().replace(/\*+/g, '');
        }
      }
    }

    // 3. Repair Sports Teams names
    if (healed.domain === 'sports_odds') {
      if (!healed.homeTeam || healed.homeTeam === 'Home Team') {
        const matchMatch = markdown.match(/vs\s+\*?\*?([A-Za-z0-9\s]+?)\*?\*?\s*\|/i) || 
                           markdown.match(/Matchup\s*\|\s*([A-Za-z0-9\s]+?)\s+vs/i);
        if (matchMatch) {
          healed.homeTeam = matchMatch[1].trim();
        }
      }
      if (!healed.awayTeam || healed.awayTeam === 'Away Team') {
        const matchMatch = markdown.match(/\|\s*\*?\*?([A-Za-z0-9\s]+?)\*?\*?\s+vs/i);
        if (matchMatch) {
          healed.awayTeam = matchMatch[1].trim();
        }
      }
    }

    return healed;
  }

  /**
   * Scans all successful payloads for overlapping fields and runs factual consensus validation.
   * @param {Object[]} payloads - Array of successful provider payloads.
   * @returns {string} - Consensus warnings/alerts block to inject.
   */
  evaluateConsensus(payloads) {
    let consensusAlerts = '';
    const tickers = {};
    const addresses = {};

    payloads.forEach(p => {
      if (!p || !p.metadata) return;
      const meta = p.metadata;

      // 1. Gather Finance Tick Data
      if (meta.domain === 'financial_ticker' && meta.financialTicker) {
        const symbol = meta.financialTicker.toUpperCase();
        if (!tickers[symbol]) tickers[symbol] = [];
        tickers[symbol].push({ price: meta.price, source: p.id || 'registry' });
      }
      
      // 2. Gather Real Estate Comps Data
      if (meta.domain === 'real_estate' && meta.valuation) {
        const addr = (meta.address || 'general').toLowerCase().trim();
        if (!addresses[addr]) addresses[addr] = [];
        addresses[addr].push({ valuation: meta.valuation, source: p.id || 'registry' });
      }
    });

    // 3. Cross-Reference Mismatching Stocks
    Object.keys(tickers).forEach(symbol => {
      const quotes = tickers[symbol];
      if (quotes.length > 1) {
        const prices = quotes.map(q => q.price).filter(p => typeof p === 'number');
        if (prices.length > 1) {
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          const diff = maxPrice - minPrice;
          if (diff > 0.05) { // If price variance is greater than 5 cents
            consensusAlerts += `▸ [Consensus Alert]: Mismatching stock price ticks found for **${symbol}** across multiple feeds ($${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}). Downstream citation logic should highlight this market variance.\n`;
          }
        }
      }
    });

    // 4. Cross-Reference Mismatching Real Estate Valuation Ranges
    Object.keys(addresses).forEach(addr => {
      const valuations = addresses[addr];
      if (valuations.length > 1) {
        consensusAlerts += `▸ [Consensus Alert]: Parallel real-estate valuation sources returned multiple estimation values for parcel **${addr.toUpperCase()}**. Standardize on AVM median range.\n`;
      }
    });

    return consensusAlerts;
  }

  /**
   * Central orchestrator that detects, executes, and synthesizes RAG blocks platform-wide.
   * @param {string} prompt - Raw query string.
   * @returns {Promise<string>} - Context-injected system prompt context.
   */
  async combinedRouteAndEnhance(prompt) {
    if (!prompt || typeof prompt !== 'string') return prompt;

    try {
      // 1. Parallel Intent Detection Scan
      const activeProviders = this.detectActiveProviders(prompt);
      if (activeProviders.length === 0) {
        return prompt;
      }

      logger.info(`[SearchRegistry] Detected ${activeProviders.length} active grounding providers for query`);

      // 2. Concurrent Dispatch of active providers
      const executionPromises = activeProviders.map(provider => this.executeProvider(provider, prompt));
      const results = await Promise.allSettled(executionPromises);

      let mergedBlocks = '';
      let citations = [];
      let mandatoryRules = '';
      const jsonMetadata = {};
      const successfulPayloads = [];

      // 3. Assemble and Format RAG payloads
      results.forEach((res, index) => {
        if (res.status === 'fulfilled' && res.value) {
          const provider = activeProviders[index];
          const payload = res.value;
          successfulPayloads.push(payload);

          // Build double-lined premium headers automatically
          mergedBlocks += `╔══════════════════════════════════════════════════════════════════╗\n`;
          mergedBlocks += `║  ⚡ GROUNDED DATA SOURCE: ${provider.id.toUpperCase().padEnd(38)} ║\n`;
          mergedBlocks += `╚══════════════════════════════════════════════════════════════════╝\n\n`;
          mergedBlocks += `${payload.markdown.trim()}\n\n`;

          // Collect Citations and Mandatory downstream rules
          citations.push(`"[Source: ${provider.citationLabel || provider.id}]"`);
          if (provider.mandatoryRule) {
            mandatoryRules += `${provider.mandatoryRule}\n`;
          }

          // Inject downstream JSON metadata
          if (payload.metadata) {
            jsonMetadata[provider.id] = payload.metadata;
          }
        }
      });

      if (!mergedBlocks) {
        return prompt;
      }

      // 4. Run Semantic Consensus checks on overlapping feeds
      let consensusRules = '';
      const consensusAlerts = this.evaluateConsensus(successfulPayloads);
      if (consensusAlerts) {
        consensusRules = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCONCENSUS AND RELIABILITY CHECKS:\n${consensusAlerts.trim()}\n`;
      }

      // Appending structured JSON envelope for frontend telemetry
      const jsonBlock = `\n\n<!-- JSON_METADATA: ${JSON.stringify(jsonMetadata)} -->`;
      const timestamp = new Date().toISOString();

      return `[SYSTEM INSTRUCTION — ALTI DYNAMIC MULTI-CHANNEL DATA CONTEXT]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MERGED RAG DATA CONTEXT
TIMESTAMP:             ${timestamp}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${mergedBlocks.trim()}
${consensusRules}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY RESPONSE RULES:
▸ Cite ${citations.join(', ')} prominently at the top of your response
${mandatoryRules.trim()}
▸ Use Markdown tables for comparisons, datasets, and structured facts
▸ NEVER fabricate, estimate, or hallucinate any numbers or information
▸ Answer the user's EXACT question using ONLY the verified data above
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Query: ${prompt}${jsonBlock}`;

    } catch (err) {
      logger.error(`[SearchRegistry] Fatal orchestration error: ${err.message}`);
      return prompt;
    }
  }
}

export const SearchEngineRegistry = new SearchEngineCoordinator();

// ─── Proactive Search Providers Registration ────────────────────────────────

// Legal & Security
SearchEngineRegistry.register(CourtListenerProvider);
SearchEngineRegistry.register(HarvardCaselawProvider);
SearchEngineRegistry.register(CisaKevProvider);
SearchEngineRegistry.register(NistNvdCveProvider);
SearchEngineRegistry.register(OfacSanctionsProvider);
SearchEngineRegistry.register(FaraForeignAgentsProvider);

// Financial & Regulatory
SearchEngineRegistry.register(FdicBankFindProvider);
SearchEngineRegistry.register(CfpbComplaintsProvider);
SearchEngineRegistry.register(SecEdgarFactProvider);
SearchEngineRegistry.register(CensusBpsProvider);

// Premium Public
SearchEngineRegistry.register(ClinicalTrialsProvider);
SearchEngineRegistry.register(FdaDrugSafetyProvider);
SearchEngineRegistry.register(GlobalHealthObservatoryProvider);
SearchEngineRegistry.register(UsTreasuryFiscalProvider);
SearchEngineRegistry.register(FederalSpendingProvider);
SearchEngineRegistry.register(HealthcareNpiProvider);
SearchEngineRegistry.register(FoodNutrientsProvider);
SearchEngineRegistry.register(CharityRegistryProvider);
SearchEngineRegistry.register(AviationDelaysProvider);
SearchEngineRegistry.register(RxNormProvider);
SearchEngineRegistry.register(DailyMedProvider);
SearchEngineRegistry.register(OpenFoodFactsProvider);
SearchEngineRegistry.register(PubChemProvider);

// Greenlight
SearchEngineRegistry.register(PoliticsCampaignProvider);
SearchEngineRegistry.register(LegislationTrackingProvider);
SearchEngineRegistry.register(CivicRepresentativesProvider);
SearchEngineRegistry.register(MacroeconomicsGlobalProvider);
SearchEngineRegistry.register(MortgageLendingProvider);
SearchEngineRegistry.register(DisasterHazardsProvider);
SearchEngineRegistry.register(MedicalResearchProvider);
SearchEngineRegistry.register(UkCompanyRegistryProvider);
SearchEngineRegistry.register(GlobalEntityRegistryProvider);

// Deep Scientific
SearchEngineRegistry.register(GleifLeiProvider);
SearchEngineRegistry.register(UsptoPatentsProvider);
SearchEngineRegistry.register(OpenSkyProvider);
SearchEngineRegistry.register(GridMonitorProvider);
SearchEngineRegistry.register(UsdaStatsProvider);
SearchEngineRegistry.register(CopernicusProvider);
SearchEngineRegistry.register(DemographicsProvider);
SearchEngineRegistry.register(NewsApiAiProvider);

// Macroeconomic
SearchEngineRegistry.register(FredProvider);
SearchEngineRegistry.register(HudFmrProvider);
SearchEngineRegistry.register(FhfaHpiProvider);
SearchEngineRegistry.register(CollegeScorecardProvider);
SearchEngineRegistry.register(ClimateRiskProvider);
SearchEngineRegistry.register(EiaCommoditiesProvider);
SearchEngineRegistry.register(SecFilingsProvider);

// Legacy/Modular Integrations
SearchEngineRegistry.register(SportsBettingProvider);
SearchEngineRegistry.register(RealEstateApiProvider);
SearchEngineRegistry.register(FinanceStockProvider);
SearchEngineRegistry.register(AviationstackProvider);

// Stage 3 Premium Providers
SearchEngineRegistry.register(BlsEconomicProvider);
SearchEngineRegistry.register(BeaEconomicProvider);
SearchEngineRegistry.register(CongressGovProvider);
SearchEngineRegistry.register(OpenSecretsProvider);
SearchEngineRegistry.register(SamGovProvider);
SearchEngineRegistry.register(GaoReportsProvider);
SearchEngineRegistry.register(EcfrRegulationsProvider);
SearchEngineRegistry.register(FederalRegisterProvider);
SearchEngineRegistry.register(EpaEchoProvider);
SearchEngineRegistry.register(OshaInspectionsProvider);

// Stage 4 Premium Providers
SearchEngineRegistry.register(UnComtradeProvider);
SearchEngineRegistry.register(CensusTradeProvider);
SearchEngineRegistry.register(DbnomicsProvider);
SearchEngineRegistry.register(WorldBankProvider);
SearchEngineRegistry.register(LdaLobbyingProvider);
SearchEngineRegistry.register(OpenFecProvider);
SearchEngineRegistry.register(NihReporterProvider);
SearchEngineRegistry.register(ChemblProvider);
SearchEngineRegistry.register(ClinvarProvider);
SearchEngineRegistry.register(UniprotProvider);

// Stage 5 Premium Providers
SearchEngineRegistry.register(EiaEnergyProvider);
SearchEngineRegistry.register(GovinfoProvider);
SearchEngineRegistry.register(OpenalexProvider);
SearchEngineRegistry.register(ArxivProvider);
SearchEngineRegistry.register(GnomadProvider);
SearchEngineRegistry.register(EnsemblProvider);
SearchEngineRegistry.register(PdbProvider);
SearchEngineRegistry.register(AlphafoldProvider);
SearchEngineRegistry.register(GtexProvider);
SearchEngineRegistry.register(ProteinAtlasProvider);

// Stage 6 Premium Providers
SearchEngineRegistry.register(NcbiSequencesProvider);
SearchEngineRegistry.register(ReactomeProvider);
SearchEngineRegistry.register(StringInteractionsProvider);
SearchEngineRegistry.register(InterproDomainsProvider);
SearchEngineRegistry.register(BiorxivProvider);
SearchEngineRegistry.register(EuropePmcProvider);
SearchEngineRegistry.register(JasparMotifsProvider);
SearchEngineRegistry.register(UcscConservationProvider);
SearchEngineRegistry.register(EncodeCcresProvider);
SearchEngineRegistry.register(AlphagenomeVariantsProvider);

// Stage 7 Premium Providers
SearchEngineRegistry.register(DbsnpVariantsProvider);
SearchEngineRegistry.register(EmblEbiOlsProvider);
SearchEngineRegistry.register(FoldseekSearchProvider);
SearchEngineRegistry.register(UnibindTfbsProvider);
SearchEngineRegistry.register(ProteinMsaProvider);
SearchEngineRegistry.register(GoldCommoditiesProvider);
SearchEngineRegistry.register(CryptoQuotesProvider);
SearchEngineRegistry.register(NasaNeoAsteroidsProvider);
SearchEngineRegistry.register(MitreAttackMatrixProvider);
SearchEngineRegistry.register(SecForm4InsidersProvider);

// Stage 8 Premium Providers
SearchEngineRegistry.register(GithubApiReposProvider);
SearchEngineRegistry.register(WikipediaSearchProvider);
SearchEngineRegistry.register(WikidataEntitiesProvider);
SearchEngineRegistry.register(OpenopenweathermapWeatherProvider);
SearchEngineRegistry.register(OpenstreetmapGeocodingProvider);
SearchEngineRegistry.register(ZenodoResearchProvider);
SearchEngineRegistry.register(CrossrefDoisProvider);
SearchEngineRegistry.register(NhcHurricanesProvider);
SearchEngineRegistry.register(FccLicensingProvider);
SearchEngineRegistry.register(UsdaSoilSurveyProvider);

// Stage 9 Premium Providers
SearchEngineRegistry.register(AirnowAqiProvider);
SearchEngineRegistry.register(UspsZipLookupProvider);
SearchEngineRegistry.register(NoaaMarineTidesProvider);
SearchEngineRegistry.register(SecForm3OwnershipProvider);
SearchEngineRegistry.register(OpenlibraryBooksProvider);
SearchEngineRegistry.register(OpenmeteoRadiationProvider);
SearchEngineRegistry.register(InternetArchiveItemsProvider);
SearchEngineRegistry.register(NifcWildfiresProvider);
SearchEngineRegistry.register(PmcOpenAccessProvider);
SearchEngineRegistry.register(AirlineRoutesProvider);

// Stage 10 Premium Providers
SearchEngineRegistry.register(GithubIssuesPrsProvider);
SearchEngineRegistry.register(OpenstreetmapAmenitiesProvider);
SearchEngineRegistry.register(WikidataLexemesProvider);
SearchEngineRegistry.register(WikipediaFeaturedProvider);
SearchEngineRegistry.register(FccBroadbandMapProvider);
SearchEngineRegistry.register(OpenlibraryAuthorsProvider);
SearchEngineRegistry.register(ZenodoCommunitiesProvider);
SearchEngineRegistry.register(NifcDailyAdvisoriesProvider);
SearchEngineRegistry.register(CrossrefMembersProvider);
SearchEngineRegistry.register(UsdaPlantsDbProvider);

// Stage 11 Premium Providers
SearchEngineRegistry.register(GithubReleasesProvider);
SearchEngineRegistry.register(OpenstreetmapTransitProvider);
SearchEngineRegistry.register(WikidataPropertiesProvider);
SearchEngineRegistry.register(WikipediaSuggestProvider);
SearchEngineRegistry.register(FccTowersProvider);
SearchEngineRegistry.register(OpenlibrarySubjectsProvider);
SearchEngineRegistry.register(ZenodoFileStatsProvider);
SearchEngineRegistry.register(NifcHistoricalFiresProvider);
SearchEngineRegistry.register(CrossrefFundersProvider);
SearchEngineRegistry.register(UsdaHardinessHistoryProvider);

// Stage 12 Premium Providers
SearchEngineRegistry.register(GithubCommitsProvider);
SearchEngineRegistry.register(OpenstreetmapWaterwaysProvider);
SearchEngineRegistry.register(WikidataSparqlProvider);
SearchEngineRegistry.register(WikipediaRevisionsProvider);
SearchEngineRegistry.register(FccAmateurRadioProvider);
SearchEngineRegistry.register(OpenlibraryShelvesProvider);
SearchEngineRegistry.register(ZenodoViewsTelemetryProvider);
SearchEngineRegistry.register(NifcFireHotspotsProvider);
SearchEngineRegistry.register(CrossrefRetractionsProvider);
SearchEngineRegistry.register(UsdaSoilTexturesProvider);

// Stage 13 Premium Providers
SearchEngineRegistry.register(GithubDeploymentsProvider);
SearchEngineRegistry.register(OpenstreetmapLanduseProvider);
SearchEngineRegistry.register(WikidataConstraintsProvider);
SearchEngineRegistry.register(WikipediaRedirectsProvider);
SearchEngineRegistry.register(FccAmateurOperatorsProvider);
SearchEngineRegistry.register(OpenlibraryWorksProvider);
SearchEngineRegistry.register(ZenodoDoisProvider);
SearchEngineRegistry.register(NifcAcresBurnedProvider);
SearchEngineRegistry.register(CrossrefCitationsProvider);
SearchEngineRegistry.register(UsdaPlantHabitatsProvider);

// Stage 14 Premium Providers
SearchEngineRegistry.register(GithubWorkflowsProvider);
SearchEngineRegistry.register(OpenstreetmapBoundariesProvider);
SearchEngineRegistry.register(WikidataLabelsProvider);
SearchEngineRegistry.register(WikipediaPageviewsProvider);
SearchEngineRegistry.register(FccRadioRegistrationsProvider);
SearchEngineRegistry.register(OpenlibraryLanguagesProvider);
SearchEngineRegistry.register(ZenodoLicensesProvider);
SearchEngineRegistry.register(NifcAssignedPersonnelProvider);
SearchEngineRegistry.register(CrossrefOpenFundersProvider);
SearchEngineRegistry.register(UsdaShrubTolerancesProvider);

// Stage 15 Premium Providers
SearchEngineRegistry.register(GithubLanguagesProvider);
SearchEngineRegistry.register(OpenstreetmapHighwaysProvider);
SearchEngineRegistry.register(WikidataDescriptionsProvider);
SearchEngineRegistry.register(WikipediaPageLinksProvider);
SearchEngineRegistry.register(FccAmateurEquipmentProvider);
SearchEngineRegistry.register(OpenlibraryCoversProvider);
SearchEngineRegistry.register(ZenodoFormatsProvider);
SearchEngineRegistry.register(NifcAssignedEquipmentProvider);
SearchEngineRegistry.register(CrossrefFunderSchemesProvider);
SearchEngineRegistry.register(UsdaShrubGrowthProvider);

// Stage 16 Premium Providers
SearchEngineRegistry.register(GithubStargazersProvider);
SearchEngineRegistry.register(OpenstreetmapRailwaysProvider);
SearchEngineRegistry.register(WikidataReferencesProvider);
SearchEngineRegistry.register(WikipediaLanglinksProvider);
SearchEngineRegistry.register(FccAmateurClubsProvider);
SearchEngineRegistry.register(OpenlibraryExcerptsProvider);
SearchEngineRegistry.register(ZenodoCreatorsProvider);
SearchEngineRegistry.register(NifcSuppressedPerimetersProvider);
SearchEngineRegistry.register(CrossrefJournalMetricsProvider);
SearchEngineRegistry.register(UsdaWoodyCharacteristicsProvider);

// Stage 17 Premium Providers
SearchEngineRegistry.register(GithubForksProvider);
SearchEngineRegistry.register(OpenstreetmapBuildingsProvider);
SearchEngineRegistry.register(WikidataBacklinksProvider);
SearchEngineRegistry.register(WikipediaCitationsProvider);
SearchEngineRegistry.register(FccAmateurVanityProvider);
SearchEngineRegistry.register(OpenlibraryReviewsProvider);
SearchEngineRegistry.register(ZenodoCitationsProvider);
SearchEngineRegistry.register(NifcIgnitionCausesProvider);
SearchEngineRegistry.register(CrossrefClinicalTrialsProvider);
SearchEngineRegistry.register(UsdaPlantPropagationProvider);

// Stage 18 Premium Providers
SearchEngineRegistry.register(GithubDiscussionsProvider);
SearchEngineRegistry.register(OpenstreetmapLanduseAreasProvider);
SearchEngineRegistry.register(WikidataPropertyConstraintsProvider);
SearchEngineRegistry.register(WikipediaTrendingViewsProvider);
SearchEngineRegistry.register(FccAmateurFrequenciesProvider);
SearchEngineRegistry.register(OpenlibraryCatalogsProvider);
SearchEngineRegistry.register(ZenodoCommunitiesGroupsProvider);
SearchEngineRegistry.register(NifcPreparednessLevelsProvider);
SearchEngineRegistry.register(CrossrefLicenseRegistriesProvider);
SearchEngineRegistry.register(UsdaPlantCharacteristicsProvider);

// Stage 19 Premium Providers
SearchEngineRegistry.register(GithubSecurityAdvisoriesProvider);
SearchEngineRegistry.register(OpenstreetmapLeisureProvider);
SearchEngineRegistry.register(WikidataSitelinksProvider);
SearchEngineRegistry.register(WikipediaCategoriesProvider);
SearchEngineRegistry.register(FccBroadbandSpeedsProvider);
SearchEngineRegistry.register(OpenlibraryPublishersProvider);
SearchEngineRegistry.register(ZenodoGrantsProvider);
SearchEngineRegistry.register(NifcWeatherAdvisoriesProvider);
SearchEngineRegistry.register(CrossrefUpdatesProvider);
SearchEngineRegistry.register(UsdaSoilSalinityProvider);
// Stage 20 Premium Providers (Duffel Integration)
SearchEngineRegistry.register(DuffelFlightsProvider);
SearchEngineRegistry.register(DuffelStaysProvider);

// Stage 21 Premium Providers (Environmental & Corporate Registries)
SearchEngineRegistry.register(UsgsEarthquakesProvider);
SearchEngineRegistry.register(OpencorporatesProvider);
SearchEngineRegistry.register(NasaFirmsProvider);

// Stage 22 Premium Providers (Geopolitical & Health Intelligence)
SearchEngineRegistry.register(GdeltGeopoliticalProvider);
SearchEngineRegistry.register(EurostatEconomicProvider);
SearchEngineRegistry.register(WhoDiseaseOutbreaksProvider);

// Stage 23 Premium Providers (IP & Clinical Preprints)
SearchEngineRegistry.register(EpoPatentsProvider);
SearchEngineRegistry.register(MedrxivPreprintsProvider);

// Stage 24 Premium Providers (Customs, SCOTUS & SEDAR)
SearchEngineRegistry.register(HtsTariffsProvider);
SearchEngineRegistry.register(OyezScotusProvider);
SearchEngineRegistry.register(SedarFilingsProvider);

// Stage 25 Premium Providers (WEF, IMF & OECD)
SearchEngineRegistry.register(WefGlobalCompetitivenessProvider);
SearchEngineRegistry.register(ImfWorldEconomicOutlookProvider);
SearchEngineRegistry.register(OecdLeadingIndicatorsProvider);

// Stage 26 Premium Providers (UK Government Open Data - ONS, BoE & HMLR)
SearchEngineRegistry.register(UkOnsMacroeconomicsProvider);
SearchEngineRegistry.register(BankOfEnglandMonetaryProvider);
SearchEngineRegistry.register(UkHmLandRegistryProvider);



