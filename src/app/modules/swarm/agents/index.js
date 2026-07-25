/**
 * @file This file serves as the central aggregation point for all custom AI agents
 * within the Inso.Assistant backend system.
 * It imports various specialized agents from different modules and compiles them
 * into a single, comprehensive list for easy access and global registration.
 *
 * The agents are categorized by their domain expertise, including general chat,
 * search, financial intelligence, expert domains, data processing, core intelligence,
 * background operations, cloud infrastructure, software development, utility tasks,
 * specialized industry knowledge, sports analytics, real estate, B2B intelligence,
 * and various writing specializations.
 */
import { generalChatAssistant } from './core.agents.js';
import {
  realtimeSearchAgent,
  perplexityDeepSearcher,
  youtubeResearcher,
  academicScholar,
  financialSearchAgent,
  academicSearchAgent,
  liveIntelAggregator,
  academicMetaAnalyst
} from './search.agents.js';

// ─── Massive.com Financial Intelligence Agents (20 specialists) ───────────────
import {
  massiveEquityAnalyst,
  massiveOptionsStrategist,
  massiveCryptoAnalyst,
  massiveForexTrader,
  massiveMacroEconomist,
  massiveTechnicalChartist,
  massiveFundamentalsAudit,
  massivePortfolioAdvisor
} from './massive.agents.js';
import {
  massiveMarketSentinel,
  massiveEarningsSpecialist,
  massiveDividendIncomePlanner,
  massiveShortSqueezeScanner,
  massiveSectorRotationAdvisor,
  massiveValueInvestor,
  massiveGrowthInvestor,
  massiveCommodityAnalyst,
  massiveETFAnalyst,
  massiveIPOAnalyst,
  massiveMomentumTrader,
  massiveRiskArbitrageur
} from './massive.agents.extended.js';
import {
  massiveInsiderFlowTracker,
  massiveOptionsFlowAlert,
  massiveFixedIncomeDesk,
  massiveREITAnalyst,
  massiveGlobalMarketsDesk,
  massiveQuantScreener,
  massiveCryptoDefiResearcher,
  massiveBehavioralCoach,
  massiveEconomicCalendarAgent,
  massiveAlternativesAdvisor,
  massiveTaxStrategyAdvisor,
  massiveRetirementPlanner
} from './massive.agents.pro.js';
import {
  startupFounderCoach,
  productManagerAdvisor,
  marketingGrowthStrategist,
  negotiationStrategist,
  businessPlanArchitect,
  clinicalResearchAdvisor,
  environmentalESGAnalyst,
  cybersecurityThreatAnalyst,
  dataPrivacyCompliance,
  scienceTutorAgent,
  creativeWritingDirector,
  careerStrategistCoach
} from './expert.agents.js';

import {
  sportsArbitrageScanner,
  sportsParlayArchitect,
  sportsSharpMoneyAnalyst,
  sportsPlayerPropsPredictor,
  sportsValueBettingQuant,
  sportsDFSExpert,
  sportsLiveOddsOrchestrator,
  sportsFuturesSpeculator
} from './predictiondata.agents.js';

import {
  realestatePropertyQuant,
  realestateMarketAnalyst,
  realestateSkipTracer
} from './realestate.agents.js';

// ─── Explorium AgentSource B2B Intelligence Agents (8 specialists) ─────────────
import {
  exploriumCompanyResearcher,
  exploriumProspectHunter,
  exploriumSignalScout,
  exploriumICPBuilder,
  exploriumSalesCoach,
  exploriumLeadScorer,
  exploriumOutreachWriter,
  exploriumMarketMapper,
} from './explorium.agents.js';


import {
  dataProcessorAgent,
  dataEtlSynthesizer,
  dbOptimizer,
  postgresDba,
  pdfIngestionAnalyst,
  realEstateAdvisor,
  schemaMapperAgent,
  payloadTransformerAgent
} from './data.agents.js';

import {
  intelligenceAgent,
  manusStrategicPlanner,
  mathTutor,
  leetcodeCoach,
  systemDesignExpert,
  pentestAuditor,
  architecturalReasoningAgent,
  mathLogicProverAgent
} from './intelligence.agents.js';
import {
  securityAuditAgent,
  perfMonitorAgent,
  cacheOptimizerAgent,
  selfCriticAgent,
  contextCompressorAgent,
  queryDisambiguator,
  factValidationCritic,
  toolRoutingOrchestrator,
  semanticCachePrewarmer,
  responseDensityOptimizer,
  authoritativeSourceGrounder,
  semanticDriftCorrector,
  semanticRelevanceScorer,
  contextAttentionPruner,
  sentimentToneGuard,
  logicCoherenceChecker,
  ingestionRouter
} from './background.agents.js';

import {
  gcpGrounding,
  terraformArchitect,
  gcpGkeExpert,
  gcpServerlessExpert,
  gcpSecurityExpert,
  gcpDatabaseExpert,
  gcpDataExpert,
  gcpMigrationSpecialist,
  gcpFinopsExpert,
  gcpMlopsExpert,
  gcpCloudRunArchitect
} from './cloud.agents.js';

import {
  coder,
  codeDebugger,
  apiDesigner,
  observabilityEngineer,
  cicdArchitect,
  rustDeveloper,
  goDeveloper,
  pythonDataScientist,
  containerSecurityExpert,
  linuxSystemsExpert,
  googleChromeExtensionDeveloper,
  googleAppsScriptDeveloper,
  googleFlutterDeveloper,
  gitGitExpert,
  openclawArchitect,
  hermesEngineer
} from './development.agents.js';

import {
  summarizer,
  translator,
  transcriber,
  documenter,
  brainstormer,
  creativeCopywriter,
  uxStrategist,
  seoContentSpecialist,
  emailCorrespondenceExpert,
  youtubeTranscriptSummarizer,
  resumeCvCoach,
  socialMediaWriter,
  pressReleaseWriter,
  grantProposalWriter
} from './utility.agents.js';
import {
  dietNutritionExpert,
  workoutFitnessCoach,
  travelItineraryArchitect,
  financialBudgetPlanner,
  legalCeaseDesistDrafter,
  financialAnalyst,
  marketResearcher,
  patentIntelResearcher,
  financialSecAuditor,
  legalRegulatoryResearcher
} from './specialized.agents.js';

import {
  emailWriter,
  letterWriter,
  songWriter,
  essayWriter,
  blogWriter,
  copywriter,
  technicalDocWriter,
  proposalWriter,
  speechWriter,
  socialMediaSwarmWriter
} from './writing.agents.js';
import { knowledgeCatalogEnricher, knowledgeDiscoveryAgent } from './catalog.agents.js';


/**
 * A comprehensive array containing instances of all custom AI agents available
 * in the Inso.Assistant ecosystem.
 * This array is designed for global registry loading, allowing the system to
 * dynamically access and utilize any specialized agent based on task requirements.
 * Agents are grouped by their functional domains for clarity and organization.
 * @type {Array<Object>}
 */
export const customAgents = [
  generalChatAssistant,
  knowledgeCatalogEnricher,
  knowledgeDiscoveryAgent,

  realtimeSearchAgent,
  perplexityDeepSearcher,
  youtubeResearcher,
  academicScholar,
  financialSearchAgent,
  academicSearchAgent,
  liveIntelAggregator,
  academicMetaAnalyst,

  // ── Massive.com Financial Intelligence Agents (20 specialists) ──────────────
  // Core 8: equity, options, crypto, forex, macro, technicals, fundamentals, portfolio
  massiveEquityAnalyst,
  massiveOptionsStrategist,
  massiveCryptoAnalyst,
  massiveForexTrader,
  massiveMacroEconomist,
  massiveTechnicalChartist,
  massiveFundamentalsAudit,
  massivePortfolioAdvisor,
  // Extended 12: sentiment, earnings, dividend, short squeeze, sector, value,
  // growth, commodity, ETF, IPO, momentum, risk arbitrage
  massiveMarketSentinel,
  massiveEarningsSpecialist,
  massiveDividendIncomePlanner,
  massiveShortSqueezeScanner,
  massiveSectorRotationAdvisor,
  massiveValueInvestor,
  massiveGrowthInvestor,
  massiveCommodityAnalyst,
  massiveETFAnalyst,
  massiveIPOAnalyst,
  massiveMomentumTrader,
  massiveRiskArbitrageur,
  // Pro 12: insider flow, options flow, fixed income, REIT, global markets,
  // quant screener, DeFi, behavioral, calendar, alternatives, tax, retirement
  massiveInsiderFlowTracker,
  massiveOptionsFlowAlert,
  massiveFixedIncomeDesk,
  massiveREITAnalyst,
  massiveGlobalMarketsDesk,
  massiveQuantScreener,
  massiveCryptoDefiResearcher,
  massiveBehavioralCoach,
  massiveEconomicCalendarAgent,
  massiveAlternativesAdvisor,
  massiveTaxStrategyAdvisor,
  massiveRetirementPlanner,
  // Expert 12: startup, product, growth, negotiation, business plan, medical research,
  // ESG, cybersecurity, privacy, science, creative writing, career
  startupFounderCoach,
  productManagerAdvisor,
  marketingGrowthStrategist,
  negotiationStrategist,
  businessPlanArchitect,
  clinicalResearchAdvisor,
  environmentalESGAnalyst,
  cybersecurityThreatAnalyst,
  dataPrivacyCompliance,
  scienceTutorAgent,
  creativeWritingDirector,
  careerStrategistCoach,

  dataProcessorAgent,
  dataEtlSynthesizer,
  dbOptimizer,
  postgresDba,
  pdfIngestionAnalyst,
  realEstateAdvisor,
  schemaMapperAgent,
  payloadTransformerAgent,

  intelligenceAgent,
  manusStrategicPlanner,
  mathTutor,
  leetcodeCoach,
  systemDesignExpert,
  pentestAuditor,
  architecturalReasoningAgent,
  mathLogicProverAgent,

  securityAuditAgent,
  perfMonitorAgent,
  cacheOptimizerAgent,
  selfCriticAgent,
  contextCompressorAgent,
  queryDisambiguator,
  factValidationCritic,
  toolRoutingOrchestrator,
  semanticCachePrewarmer,
  responseDensityOptimizer,
  authoritativeSourceGrounder,
  semanticDriftCorrector,
  semanticRelevanceScorer,
  contextAttentionPruner,
  sentimentToneGuard,
  logicCoherenceChecker,
  ingestionRouter,

  gcpGrounding,
  terraformArchitect,
  gcpGkeExpert,
  gcpServerlessExpert,
  gcpSecurityExpert,
  gcpDatabaseExpert,
  gcpDataExpert,
  gcpMigrationSpecialist,
  gcpFinopsExpert,
  gcpMlopsExpert,
  gcpCloudRunArchitect,

  coder,
  codeDebugger,
  apiDesigner,
  observabilityEngineer,
  cicdArchitect,
  rustDeveloper,
  goDeveloper,
  pythonDataScientist,
  containerSecurityExpert,
  linuxSystemsExpert,
  googleChromeExtensionDeveloper,
  googleAppsScriptDeveloper,
  googleFlutterDeveloper,
  gitGitExpert,
  openclawArchitect,
  hermesEngineer,

  summarizer,
  translator,
  transcriber,
  documenter,
  brainstormer,
  creativeCopywriter,
  uxStrategist,
  seoContentSpecialist,
  emailCorrespondenceExpert,
  youtubeTranscriptSummarizer,
  resumeCvCoach,
  socialMediaWriter,
  pressReleaseWriter,
  grantProposalWriter,

  dietNutritionExpert,
  workoutFitnessCoach,
  travelItineraryArchitect,
  financialBudgetPlanner,
  legalCeaseDesistDrafter,
  financialAnalyst,
  marketResearcher,
  patentIntelResearcher,
  financialSecAuditor,
  legalRegulatoryResearcher,

  // ── PredictionData.io Sports Swarm Agents ──────────────────────────────────
  sportsArbitrageScanner,
  sportsParlayArchitect,
  sportsSharpMoneyAnalyst,
  sportsPlayerPropsPredictor,
  sportsValueBettingQuant,
  sportsDFSExpert,
  sportsLiveOddsOrchestrator,
  sportsFuturesSpeculator,

  // ── RealEstateAPI.com Real Estate Swarm Agents ─────────────────────────────
  realestatePropertyQuant,
  realestateMarketAnalyst,
  realestateSkipTracer,

  // ── Explorium AgentSource B2B Intelligence Agents ───────────────────────────
  exploriumCompanyResearcher,
  exploriumProspectHunter,
  exploriumSignalScout,
  exploriumICPBuilder,
  exploriumSalesCoach,
  exploriumLeadScorer,
  exploriumOutreachWriter,
  exploriumMarketMapper,

  // ── Specialized Writing Swarm Agents ───────────────────────────────────────
  emailWriter,
  letterWriter,
  songWriter,
  essayWriter,
  blogWriter,
  copywriter,
  technicalDocWriter,
  proposalWriter,
  speechWriter,
  socialMediaSwarmWriter,
];

/**
 * Re-exports of all individual custom AI agents, making them directly accessible
 * for modular use throughout the application. Each agent is a specialized AI
 * model designed for specific tasks across various domains.
 *
 * @exports {Object} generalChatAssistant - A general-purpose AI assistant for broad conversational tasks.
 *
 * @exports {Object} realtimeSearchAgent - An AI agent specialized in performing real-time searches.
 * @exports {Object} perplexityDeepSearcher - An AI agent for deep, comprehensive searches using Perplexity AI.
 * @exports {Object} youtubeResearcher - An AI agent focused on researching and summarizing YouTube content.
 * @exports {Object} academicScholar - An AI agent designed for academic research and scholarly article retrieval.
 * @exports {Object} financialSearchAgent - An AI agent providing financial market research and analysis.
 * @exports {Object} academicSearchAgent - An AI agent dedicated to searching and analyzing academic literature.
 * @exports {Object} liveIntelAggregator - An AI agent for aggregating and synthesizing live intelligence.
 * @exports {Object} academicMetaAnalyst - An AI agent specializing in meta-analysis of academic research.
 *
 * @exports {Object} massiveEquityAnalyst - A financial AI agent specializing in equity market analysis.
 * @exports {Object} massiveOptionsStrategist - A financial AI agent for developing options trading strategies.
 * @exports {Object} massiveCryptoAnalyst - A financial AI agent focused on cryptocurrency market analysis.
 * @exports {Object} massiveForexTrader - A financial AI agent specializing in foreign exchange market trading.
 * @exports {Object} massiveMacroEconomist - A financial AI agent providing macroeconomic analysis and insights.
 * @exports {Object} massiveTechnicalChartist - A financial AI agent for technical analysis and charting.
 * @exports {Object} massiveFundamentalsAudit - A financial AI agent for auditing company fundamentals.
 * @exports {Object} massivePortfolioAdvisor - A financial AI agent offering portfolio management advice.
 * @exports {Object} massiveMarketSentinel - A financial AI agent for monitoring market sentiment and trends.
 * @exports {Object} massiveEarningsSpecialist - A financial AI agent focused on earnings report analysis.
 * @exports {Object} massiveDividendIncomePlanner - A financial AI agent for planning dividend income strategies.
 * @exports {Object} massiveShortSqueezeScanner - A financial AI agent for identifying potential short squeeze opportunities.
 * @exports {Object} massiveSectorRotationAdvisor - A financial AI agent advising on sector rotation strategies.
 * @exports {Object} massiveValueInvestor - A financial AI agent specializing in value investing strategies.
 * @exports {Object} massiveGrowthInvestor - A financial AI agent focused on growth investing opportunities.
 * @exports {Object} massiveCommodityAnalyst - A financial AI agent for commodity market analysis.
 * @exports {Object} massiveETFAnalyst - A financial AI agent specializing in Exchange Traded Fund (ETF) analysis.
 * @exports {Object} massiveIPOAnalyst - A financial AI agent for Initial Public Offering (IPO) analysis.
 * @exports {Object} massiveMomentumTrader - A financial AI agent focused on momentum trading strategies.
 * @exports {Object} massiveRiskArbitrageur - A financial AI agent specializing in risk arbitrage strategies.
 * @exports {Object} massiveInsiderFlowTracker - A financial AI agent for tracking insider trading activity.
 * @exports {Object} massiveOptionsFlowAlert - A financial AI agent for alerting on significant options flow.
 * @exports {Object} massiveFixedIncomeDesk - A financial AI agent specializing in fixed income analysis.
 * @exports {Object} massiveREITAnalyst - A financial AI agent for Real Estate Investment Trust (REIT) analysis.
 * @exports {Object} massiveGlobalMarketsDesk - A financial AI agent providing global market insights.
 * @exports {Object} massiveQuantScreener - A financial AI agent for quantitative stock screening.
 * @exports {Object} massiveCryptoDefiResearcher - A financial AI agent focused on cryptocurrency and DeFi research.
 * @exports {Object} massiveBehavioralCoach - A financial AI agent providing behavioral finance coaching.
 * @exports {Object} massiveEconomicCalendarAgent - A financial AI agent tracking and analyzing economic calendar events.
 * @exports {Object} massiveAlternativesAdvisor - A financial AI agent advising on alternative investments.
 * @exports {Object} massiveTaxStrategyAdvisor - A financial AI agent for tax strategy planning.
 * @exports {Object} massiveRetirementPlanner - A financial AI agent specializing in retirement planning.
 *
 * @exports {Object} dataProcessorAgent - An AI agent for general data processing tasks.
 * @exports {Object} dataEtlSynthesizer - An AI agent for Extract, Transform, Load (ETL) data synthesis.
 * @exports {Object} dbOptimizer - An AI agent for optimizing database performance.
 * @exports {Object} postgresDba - An AI agent specializing in PostgreSQL database administration.
 * @exports {Object} pdfIngestionAnalyst - An AI agent for ingesting and analyzing PDF documents.
 * @exports {Object} realEstateAdvisor - An AI agent providing real estate advice and analysis.
 * @exports {Object} schemaMapperAgent - An AI agent for mapping data schemas.
 * @exports {Object} payloadTransformerAgent - An AI agent for transforming data payloads.
 *
 * @exports {Object} intelligenceAgent - A general-purpose intelligence AI agent.
 * @exports {Object} manusStrategicPlanner - An AI agent for strategic planning.
 * @exports {Object} mathTutor - An AI agent providing math tutoring.
 * @exports {Object} leetcodeCoach - An AI agent for LeetCode problem-solving coaching.
 * @exports {Object} systemDesignExpert - An AI agent specializing in system design.
 * @exports {Object} pentestAuditor - An AI agent for penetration testing and security auditing.
 * @exports {Object} architecturalReasoningAgent - An AI agent for architectural reasoning and design.
 * @exports {Object} mathLogicProverAgent - An AI agent for proving mathematical logic.
 *
 * @exports {Object} securityAuditAgent - An AI agent for performing security audits.
 * @exports {Object} perfMonitorAgent - An AI agent for monitoring system performance.
 * @exports {Object} cacheOptimizerAgent - An AI agent for optimizing caching strategies.
 * @exports {Object} selfCriticAgent - An AI agent capable of self-critique and improvement.
 * @exports {Object} contextCompressorAgent - An AI agent for compressing contextual information.
 * @exports {Object} queryDisambiguator - An AI agent for disambiguating ambiguous queries.
 * @exports {Object} factValidationCritic - An AI agent for validating facts and identifying inaccuracies.
 * @exports {Object} toolRoutingOrchestrator - An AI agent for orchestrating and routing tool usage.
 * @exports {Object} semanticCachePrewarmer - An AI agent for prewarming semantic caches.
 * @exports {Object} responseDensityOptimizer - An AI agent for optimizing response density.
 * @exports {Object} authoritativeSourceGrounder - An AI agent for grounding information in authoritative sources.
 * @exports {Object} semanticDriftCorrector - An AI agent for correcting semantic drift.
 * @exports {Object} semanticRelevanceScorer - An AI agent for scoring semantic relevance.
 * @exports {Object} contextAttentionPruner - An AI agent for pruning irrelevant context.
 * @exports {Object} sentimentToneGuard - An AI agent for monitoring sentiment and tone.
 * @exports {Object} logicCoherenceChecker - An AI agent for checking logical coherence.
 * @exports {Object} ingestionRouter - An AI agent for routing data ingestion.
 *
 * @exports {Object} gcpGrounding - An AI agent specializing in GCP foundational knowledge and best practices.
 * @exports {Object} terraformArchitect - An AI agent for designing and managing infrastructure with Terraform.
 * @exports {Object} gcpGkeExpert - An AI agent specializing in Google Kubernetes Engine (GKE) on GCP.
 * @exports {Object} gcpServerlessExpert - An AI agent specializing in serverless architectures on GCP.
 * @exports {Object} gcpSecurityExpert - An AI agent focused on security best practices and services on GCP.
 * @exports {Object} gcpDatabaseExpert - An AI agent specializing in database solutions on GCP.
 * @exports {Object} gcpDataExpert - An AI agent focused on data analytics and processing services on GCP.
 * @exports {Object} gcpMigrationSpecialist - An AI agent for planning and executing migrations to GCP.
 * @exports {Object} gcpFinopsExpert - An AI agent specializing in financial operations and cost optimization on GCP.
 * @exports {Object} gcpMlopsExpert - An AI agent focused on MLOps practices and services on GCP.
 * @exports {Object} gcpCloudRunArchitect - An AI agent for designing and deploying applications with GCP Cloud Run.
 *
 * @exports {Object} coder - A general-purpose AI agent for writing code.
 * @exports {Object} codeDebugger - An AI agent for debugging code.
 * @exports {Object} apiDesigner - An AI agent for designing APIs.
 * @exports {Object} observabilityEngineer - An AI agent specializing in observability and monitoring.
 * @exports {Object} cicdArchitect - An AI agent for designing CI/CD pipelines.
 * @exports {Object} rustDeveloper - An AI agent specializing in Rust development.
 * @exports {Object} goDeveloper - An AI agent specializing in Go development.
 * @exports {Object} pythonDataScientist - An AI agent specializing in Python for data science.
 * @exports {Object} containerSecurityExpert - An AI agent for container security.
 * @exports {Object} linuxSystemsExpert - An AI agent specializing in Linux systems.
 * @exports {Object} googleChromeExtensionDeveloper - An AI agent for developing Chrome extensions.
 * @exports {Object} googleAppsScriptDeveloper - An AI agent for developing Google Apps Script solutions.
 * @exports {Object} googleFlutterDeveloper - An AI agent for developing Flutter applications.
 * @exports {Object} gitGitExpert - An AI agent specializing in Git and version control.
 * @exports {Object} openclawArchitect - An AI agent for OpenClaw architecture.
 * @exports {Object} hermesEngineer - An AI agent specializing in Hermes engineering.
 *
 * @exports {Object} summarizer - An AI agent for summarizing text.
 * @exports {Object} translator - An AI agent for translating languages.
 * @exports {Object} transcriber - An AI agent for transcribing audio.
 * @exports {Object} documenter - An AI agent for generating documentation.
 * @exports {Object} brainstormer - An AI agent for brainstorming ideas.
 * @exports {Object} creativeCopywriter - An AI agent for creative copywriting.
 * @exports {Object} uxStrategist - An AI agent for UX strategy.
 * @exports {Object} seoContentSpecialist - An AI agent for SEO content optimization.
 * @exports {Object} emailCorrespondenceExpert - An AI agent for managing email correspondence.
 * @exports {Object} youtubeTranscriptSummarizer - An AI agent for summarizing YouTube video transcripts.
 * @exports {Object} resumeCvCoach - An AI agent for resume and CV coaching.
 * @exports {Object} socialMediaWriter - An AI agent for writing social media content.
 * @exports {Object} pressReleaseWriter - An AI agent for writing press releases.
 * @exports {Object} grantProposalWriter - An AI agent for writing grant proposals.
 *
 * @exports {Object} dietNutritionExpert - An AI agent specializing in diet and nutrition advice.
 * @exports {Object} workoutFitnessCoach - An AI agent providing workout and fitness coaching.
 * @exports {Object} travelItineraryArchitect - An AI agent for designing travel itineraries.
 * @exports {Object} financialBudgetPlanner - An AI agent for financial budget planning.
 * @exports {Object} legalCeaseDesistDrafter - An AI agent for drafting legal cease and desist letters.
 * @exports {Object} financialAnalyst - An AI agent for financial analysis.
 * @exports {Object} marketResearcher - An AI agent for market research.
 * @exports {Object} patentIntelResearcher - An AI agent for patent intelligence research.
 * @exports {Object} financialSecAuditor - An AI agent for financial security auditing.
 * @exports {Object} legalRegulatoryResearcher - An AI agent for legal and regulatory research.
 *
 * @exports {Object} startupFounderCoach - An AI agent coaching startup founders.
 * @exports {Object} productManagerAdvisor - An AI agent advising product managers.
 * @exports {Object} marketingGrowthStrategist - An AI agent for marketing growth strategies.
 * @exports {Object} negotiationStrategist - An AI agent specializing in negotiation strategies.
 * @exports {Object} businessPlanArchitect - An AI agent for architecting business plans.
 * @exports {Object} clinicalResearchAdvisor - An AI agent advising on clinical research.
 * @exports {Object} environmentalESGAnalyst - An AI agent for environmental, social, and governance (ESG) analysis.
 * @exports {Object} cybersecurityThreatAnalyst - An AI agent for cybersecurity threat analysis.
 * @exports {Object} dataPrivacyCompliance - An AI agent specializing in data privacy compliance.
 * @exports {Object} scienceTutorAgent - An AI agent providing science tutoring.
 * @exports {Object} creativeWritingDirector - An AI agent for creative writing direction.
 * @exports {Object} careerStrategistCoach - An AI agent for career strategy coaching.
 *
 * @exports {Object} sportsArbitrageScanner - An AI agent for scanning sports arbitrage opportunities.
 * @exports {Object} sportsParlayArchitect - An AI agent for constructing sports parlay bets.
 * @exports {Object} sportsSharpMoneyAnalyst - An AI agent for analyzing "sharp money" in sports betting.
 * @exports {Object} sportsPlayerPropsPredictor - An AI agent for predicting player proposition bets in sports.
 * @exports {Object} sportsValueBettingQuant - An AI agent for quantitative value betting in sports.
 * @exports {Object} sportsDFSExpert - An AI agent specializing in Daily Fantasy Sports (DFS).
 * @exports {Object} sportsLiveOddsOrchestrator - An AI agent for orchestrating live sports odds.
 * @exports {Object} sportsFuturesSpeculator - An AI agent for speculating on sports futures markets.
 *
 * @exports {Object} realestatePropertyQuant - An AI agent for quantitative analysis of real estate properties.
 * @exports {Object} realestateMarketAnalyst - An AI agent for real estate market analysis.
 * @exports {Object} realestateSkipTracer - An AI agent for real estate skip tracing.
 *
 * @exports {Object} exploriumCompanyResearcher - An AI agent for researching companies using Explorium data.
 * @exports {Object} exploriumProspectHunter - An AI agent for identifying sales prospects using Explorium data.
 * @exports {Object} exploriumSignalScout - An AI agent for scouting business signals using Explorium data.
 * @exports {Object} exploriumICPBuilder - An AI agent for building Ideal Customer Profiles (ICPs) using Explorium data.
 * @exports {Object} exploriumSalesCoach - An AI agent providing sales coaching based on Explorium insights.
 * @exports {Object} exploriumLeadScorer - An AI agent for scoring sales leads using Explorium data.
 * @exports {Object} exploriumOutreachWriter - An AI agent for writing sales outreach content using Explorium insights.
 * @exports {Object} exploriumMarketMapper - An AI agent for mapping markets using Explorium data.
 *
 * @exports {Object} emailWriter - An AI agent for writing emails.
 * @exports {Object} letterWriter - An AI agent for writing letters.
 * @exports {Object} songWriter - An AI agent for writing songs.
 * @exports {Object} essayWriter - An AI agent for writing essays.
 * @exports {Object} blogWriter - An AI agent for writing blog posts.
 * @exports {Object} copywriter - An AI agent for general copywriting tasks.
 * @exports {Object} technicalDocWriter - An AI agent for writing technical documentation.
 * @exports {Object} proposalWriter - An AI agent for writing proposals.
 * @exports {Object} speechWriter - An AI agent for writing speeches.
 * @exports {Object} socialMediaSwarmWriter - An AI agent for generating social media content in bulk.
 */
export {
  generalChatAssistant,

  realtimeSearchAgent,
  perplexityDeepSearcher,
  youtubeResearcher,
  academicScholar,
  financialSearchAgent,
  academicSearchAgent,
  liveIntelAggregator,
  academicMetaAnalyst,

  // ── Massive.com Financial Intelligence Agents ──────────────────────────────
  massiveEquityAnalyst,
  massiveOptionsStrategist,
  massiveCryptoAnalyst,
  massiveForexTrader,
  massiveMacroEconomist,
  massiveTechnicalChartist,
  massiveFundamentalsAudit,
  massivePortfolioAdvisor,
  massiveMarketSentinel,
  massiveEarningsSpecialist,
  massiveDividendIncomePlanner,
  massiveShortSqueezeScanner,
  massiveSectorRotationAdvisor,
  massiveValueInvestor,
  massiveGrowthInvestor,
  massiveCommodityAnalyst,
  massiveETFAnalyst,
  massiveIPOAnalyst,
  massiveMomentumTrader,
  massiveRiskArbitrageur,
  massiveInsiderFlowTracker,
  massiveOptionsFlowAlert,
  massiveFixedIncomeDesk,
  massiveREITAnalyst,
  massiveGlobalMarketsDesk,
  massiveQuantScreener,
  massiveCryptoDefiResearcher,
  massiveBehavioralCoach,
  massiveEconomicCalendarAgent,
  massiveAlternativesAdvisor,
  massiveTaxStrategyAdvisor,
  massiveRetirementPlanner,

  dataProcessorAgent,
  dataEtlSynthesizer,
  dbOptimizer,
  postgresDba,
  pdfIngestionAnalyst,
  realEstateAdvisor,
  schemaMapperAgent,
  payloadTransformerAgent,

  intelligenceAgent,
  manusStrategicPlanner,
  mathTutor,
  leetcodeCoach,
  systemDesignExpert,
  pentestAuditor,
  architecturalReasoningAgent,
  mathLogicProverAgent,

  securityAuditAgent,
  perfMonitorAgent,
  cacheOptimizerAgent,
  selfCriticAgent,
  contextCompressorAgent,
  queryDisambiguator,
  factValidationCritic,
  toolRoutingOrchestrator,
  semanticCachePrewarmer,
  responseDensityOptimizer,
  authoritativeSourceGrounder,
  semanticDriftCorrector,
  semanticRelevanceScorer,
  contextAttentionPruner,
  sentimentToneGuard,
  logicCoherenceChecker,
  ingestionRouter,

  gcpGrounding,
  terraformArchitect,
  gcpGkeExpert,
  gcpServerlessExpert,
  gcpSecurityExpert,
  gcpDatabaseExpert,
  gcpDataExpert,
  gcpMigrationSpecialist,
  gcpFinopsExpert,
  gcpMlopsExpert,
  gcpCloudRunArchitect,

  coder,
  codeDebugger,
  apiDesigner,
  observabilityEngineer,
  cicdArchitect,
  rustDeveloper,
  goDeveloper,
  pythonDataScientist,
  containerSecurityExpert,
  linuxSystemsExpert,
  googleChromeExtensionDeveloper,
  googleAppsScriptDeveloper,
  googleFlutterDeveloper,
  gitGitExpert,
  openclawArchitect,
  hermesEngineer,

  summarizer,
  translator,
  transcriber,
  documenter,
  brainstormer,
  creativeCopywriter,
  uxStrategist,
  seoContentSpecialist,
  emailCorrespondenceExpert,
  youtubeTranscriptSummarizer,
  resumeCvCoach,
  socialMediaWriter,
  pressReleaseWriter,
  grantProposalWriter,

  dietNutritionExpert,
  workoutFitnessCoach,
  travelItineraryArchitect,
  financialBudgetPlanner,
  legalCeaseDesistDrafter,
  financialAnalyst,
  marketResearcher,
  patentIntelResearcher,
  financialSecAuditor,
  legalRegulatoryResearcher,

  // ── Expert Domain Intelligence Agents (Batch 4) ──────────────────────────
  startupFounderCoach,
  productManagerAdvisor,
  marketingGrowthStrategist,
  negotiationStrategist,
  businessPlanArchitect,
  clinicalResearchAdvisor,
  environmentalESGAnalyst,
  cybersecurityThreatAnalyst,
  dataPrivacyCompliance,
  scienceTutorAgent,
  creativeWritingDirector,
  careerStrategistCoach,

  // ── PredictionData.io Sports Swarm Agents ──────────────────────────────────
  sportsArbitrageScanner,
  sportsParlayArchitect,
  sportsSharpMoneyAnalyst,
  sportsPlayerPropsPredictor,
  sportsValueBettingQuant,
  sportsDFSExpert,
  sportsLiveOddsOrchestrator,
  sportsFuturesSpeculator,

  // ── RealEstateAPI.com Real Estate Swarm Agents ─────────────────────────────
  realestatePropertyQuant,
  realestateMarketAnalyst,
  realestateSkipTracer,

  // ── Explorium AgentSource B2B Intelligence Agents ───────────────────────────
  exploriumCompanyResearcher,
  exploriumProspectHunter,
  exploriumSignalScout,
  exploriumICPBuilder,
  exploriumSalesCoach,
  exploriumLeadScorer,
  exploriumOutreachWriter,
  exploriumMarketMapper,

  // ── Specialized Writing Swarm Agents ───────────────────────────────────────
  emailWriter,
  letterWriter,
  songWriter,
  essayWriter,
  blogWriter,
  copywriter,
  technicalDocWriter,
  proposalWriter,
  speechWriter,
  socialMediaSwarmWriter,
};