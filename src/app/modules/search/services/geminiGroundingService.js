import config from '../../../../../config/index.js';
import { GoogleGenAI } from '@google/genai';
import { massiveSmartRouter } from '../../../helpers/massiveSmartRouter.js';
import { UnifiedSmartRouter } from '../../../helpers/UnifiedSmartRouter.js';
import { isVideoOnlyQuery, searchYouTube, extractVideoCount } from '../utils/videoUtils.js';
import { GcpNativeService } from '../../gcp_native/gcp-native.service.js';
import {
  classifyAcademicQuery,
  classifyDiscussionQuery,
  classifyNewsQuery,
  classifyWeatherQuery,
  classifyMedicalQuery,
  classifyFoodQuery,
  classifyLegalQuery,
  classifyPatentQuery,
  classifySecurityQuery,
  classifyGovFinanceQuery,
  classifyRealEstateQuery,
  classifyEconomicsQuery,
  classifyBiologyQuery,
  classifyEntertainmentQuery,
  classifyTravelQuery,
  classifyShoppingQuery,
  classifyCareerQuery,
  classifyAutomotiveQuery,
  classifyGamingQuery,
  classifyEnvironmentQuery,
  classifyLocalQuery,
  classifyEducationQuery,
  classifyDIYQuery,
  classifySpaceAviationQuery,
  classifyHistoryQuery,
  classifyArtDesignQuery,
  classifyPhilosophyQuery,
  classifyMusicQuery,
  classifyPetsQuery,
  classifyGeopoliticsQuery,
  classifyArchitectureQuery,
  classifyAgricultureQuery,
  classifyChemistryQuery,
  classifyHobbiesQuery,
  classifyLogisticsQuery,
  classifyPersonalFinanceQuery,
  classifyCryptoQuery,
  classifyFitnessQuery,
  classifyPsychologyQuery,
  classifyInsuranceQuery,
  classifyRoboticsQuery,
  classifyTicketingQuery,
  classifyAstronomyQuery,
  classifyAnthropologyQuery,
  classifyLinguisticsQuery,
  classifyPediatricsQuery,
  classifySustainabilityQuery,
  classifyDropshippingQuery,
  classifyCivilLawQuery,
  classifyPedagogyQuery,
  classifyVeterinaryQuery,
  classifyMeteorologyQuery,
  classifyUrbanPlanningQuery,
  classifyFoodChemistryQuery,
  classifyMarineBiologyQuery,
  classifyTheoreticalPhysicsQuery,
  classifyPaleontologyQuery,
  classifyBiomedicalQuery,
  classifyClimatologyQuery,
  classifyNeurotechQuery,
  classifyAstrobiologyQuery,
  classifyNanotechQuery,
  classifyNuclearQuery,
  classifyGeneticsQuery,
  classifyVentureCapitalQuery,
  classifyDigitalHumanitiesQuery,
  classifyVirologyQuery,
  classifyQuantumComputingQuery,
  classifyMetallurgyQuery,
  classifyOrganicChemistryQuery,
  classifyGridInfrastructureQuery,
  classifyMLOpsQuery,
  classifyFluidDynamicsQuery,
  classifyEndocrinologyQuery,
  classifyCryptographyQuery,
  classifyBehavioralEconomicsQuery,
  classifySeismologyQuery,
  classifyCompilerDesignQuery,
} from './queryClassifier.js';
const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });
/**
 * Gemini Grounding Service with Native Google Search
 * Uses Google's built-in grounding for simpler, more reliable search
 */

// Legacy GoogleGenerativeAI removed to standardize on GoogleGenAI client

/**
 * Create a grounded Gemini model with native Google Search
 * @param {string} modelName - Model to use (default: gemini-3.5-flash)
 * @returns {GenerativeModel} Configured model instance
 */
export function createGroundedModel(modelName = 'gemini-3.5-flash') {
  console.log(`[createGroundedModel] Legacy helper called. Standardizing on GoogleGenAI client.`);
  return {
    model: modelName,
    generateContent: async (req) => {
      return ai.models.generateContent({
        model: modelName,
        ...req,
        config: {
          ...req.config,
          tools: [{ googleSearch: {} }]
        }
      });
    }
  };
}

/**
 * Estimate token count for conversation history
 * @param {Array} messages - Array of messages
 * @returns {number} Estimated token count
 */
async function estimateTokens(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 0;

  const totalChars = messages.reduce((sum, msg) => {
    const content = msg.content || '';
    return sum + content.length;
  }, 0);
  let makeASingleMessage = '';

  messages.forEach((msg) => {
    makeASingleMessage += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n\n`;
  });
  const countingModel = new GoogleGenAI({ apiKey: config.gemini_secret_key });

  console.log(
    'Making a single message for token estimation: ',
    makeASingleMessage
  );
  const totalToken = await countingModel.models.countTokens({
    contents: makeASingleMessage,
    model: 'gemini-3.5-flash',
  });

  // Rough estimate: 1 token ≈ 4 characters
  return totalToken.totalTokens;
}

/**
 * Summarize conversation history when it exceeds token limits
 * @param {Array} conversationHistory - Full conversation history
 * @param {Object} ai - Google GenAI instance
 * @returns {Object} Summarized history with summary message
 */
/**
 * Semantically compresses conversation history to protect technical context and metrics
 * while purging conversational pleasantries and filler tokens.
 * @param {Array} conversationHistory - Full history array.
 * @param {Object} ai - Google GenAI instance.
 * @returns {Array} - Compressed conversation history.
 */
async function compressHistorySemantically(conversationHistory, ai) {
  console.log(
    `📝 Semantically compressing ${conversationHistory.length} messages in conversation history`
  );

  try {
    const conversationText = conversationHistory
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    const compressionPrompt = `You are a high-fidelity Factual Semantic Context Compressor.
Your sole job is to compress the conversation history below by at least 50% in token size while maintaining absolute factual integrity.

STRICT COMPRESSION RULES:
1. RETAIN all Markdown tables, exact numerical values, stock tickers (e.g. AAPL), betting odds (e.g. -110), real estate values, and clinical/legal citation keys.
2. DELETE all assistant polite preambles ("Sure, I can help with...", "According to..."), filler text, and general conversational pleasantries.
3. CONDENSE user requests down to their core technical intent.
4. MAINTAIN chronological ordering of the core facts.

Conversation History to compress:
${conversationText}

Compressed History (in the same format, clear and highly dense):`;

    const result = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: compressionPrompt }],
        },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 2000,
      }
    });

    const compressedText = result.candidates[0].content.parts[0].text;
    console.log(`✅ History compressed: ${compressedText.length} characters`);
    
    // Return as a single high-density reference message
    return [
      {
        role: 'user',
        content: `[COMPRESSED HISTORY ARCHIVE - FACTUAL REFERENCE CONTEXT]\n\n${compressedText}`,
      },
    ];
  } catch (error) {
    console.error('❌ Error compressing history semantically:', error);
    // Fallback: keep only last 3 messages if compression fails
    return conversationHistory.slice(-3);
  }
}

const systemPrompt = `You are an intelligent research assistant providing CONCRETE, specific answers with complete details.

═══════════════════════════════════════════════════════════════════════════════
CORE PRINCIPLES
═══════════════════════════════════════════════════════════════════════════════
✓ Direct essential information only - no fluff, no context unless critical
✓ Never mention "search results", "sources indicate", or reference search process
✓ State facts concisely - remove date qualifiers like "after today" or "next game after [date]"
✓ If incomplete info: "The exact date and time is not scheduled"

FORBIDDEN PHRASES:
❌ "Search results indicate..." | "Please refer to..." | "Check the official..."
❌ "According to search results..." | "Based on the information found..."
❌ "I cannot provide predictions/financial advice..." (provide data-driven analysis instead)
❌ "after [date]" | "next game after today" | Any unnecessary date qualifiers

═══════════════════════════════════════════════════════════════════════════════
RESPONSE MODE DIRECTIVES
═══════════════════════════════════════════════════════════════════════════════

**"PICK ONE" / "CHOOSE ONE":**
When user asks "pick one", "choose one", "which is better", or "A or B?":
→ ONE definitive choice ONLY. No explanations, comparisons, or "here's why" sections.
✅ GOOD: "Palo Alto, CA."
❌ BAD: "Palo Alto, CA, would be better because it's the heart of Silicon Valley..."

**"ANSWER ONLY":**
When user requests "answer only", "just answer", "one answer only", "short answer":
→ Single most definitive answer. No alternatives, no "it depends", no lists.
→ CRITICAL: Distinguish solution types (data providers ≠ databases ≠ platforms ≠ tools)
✅ GOOD: "CoinGecko provides the best real-time cryptocurrency data for AI and RAG."
❌ BAD: "Key providers include: Pinecone, Zyre, K2view..." (listing multiple)
❌ BAD: "Pinecone provides..." (Pinecone is a database, not a data provider)

═══════════════════════════════════════════════════════════════════════════════
RESPONSE FORMATS BY CATEGORY
═══════════════════════════════════════════════════════════════════════════════

**SPORTS/EVENTS:**
Format: Date + Time + Opponent (all 3 required)
✅ "November 7, 2025 at 7:00 PM against the New York Rangers"
❌ "October 25, 2025" (missing time + opponent)
❌ "The next home game after October 23 is Friday, November 7..." (unnecessary context)

Game Type Rules:
• "next home game" = team's home venue ONLY
• "next away game" = opponent's venue ONLY (@ indicator)
• "next game" = closest game regardless of location

Verification: Use site-specific searches (site:nhl.com, site:espn.com, site:team-site)
Cross-check 2+ official sources. If conflict: "Sources show conflicting information: [list details]"

**WEATHER:**
Format: Temperature, conditions (concise)
✅ "72°F, partly cloudy, 20% chance of rain"
❌ "Based on search results, today's weather in Detroit is 72°F with partly cloudy skies..."

**BUSINESS/INVESTMENT/FINANCIAL:**
→ ALWAYS search for current market data, trends, expert opinions
→ Provide data-driven insights with specific metrics
→ Structure: [Data & Analysis] → [Key Factors] → **[Bottom Line]**
→ End with clear synthesis: "**Bottom Line:** Current data suggests [bullish/bearish/neutral]. Key: [1-3 points]"
→ If "answer only" requested: Single best recommendation, no alternatives

**NEWS/FACTS:**
Core information only, no unnecessary context

═══════════════════════════════════════════════════════════════════════════════
SEARCH STRATEGY
═══════════════════════════════════════════════════════════════════════════════

General:
• Use multiple specific queries to find complete information
• Combine info from multiple sources for complete answers

Sports-Specific:
• Use site restrictions: site:nhl.com, site:espn.com, site:viagogo.com
• Verify with 2-3 different searches across official sources
• Cross-check dates, times, opponents before responding

Solution Type Classification:
• Data Providers (raw data APIs): CoinGecko, CoinMarketCap, Binance API, Kraken API
• Databases (storage/query): Pinecone, Weaviate, ChromaDB
• Platforms (complete solutions): Zyre, K2view
• Tools (libraries/frameworks): LangChain, LlamaIndex
→ Match response to what user ACTUALLY asks for

ALWAYS Search For:
✅ Sports schedules/games | Weather forecasts | News/current events
✅ Market/financial data (investment/crypto queries)
✅ Business trends | Tech developments | Any time-sensitive info

═══════════════════════════════════════════════════════════════════════════════
FINAL REMINDER: Minimal, direct answers. Essential details only. No fluff.
═══════════════════════════════════════════════════════════════════════════════`;

/**
 * Execute a grounded search with streaming support
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages for context
 * @yields {Object} Chunks containing thinking or text parts
 * @returns {AsyncGenerator} Stream of response chunks
 */
export async function* executeGroundedSearchStream(
  query,
  conversationHistory = []
) {
  console.log(`🔍 Executing streaming grounded search: "${query}"`);

  // 1. Check for financial queries using massiveSmartRouter
  const enhancedQuery = await massiveSmartRouter.routeAndEnhancePrompt(query);
  const isFinancialQuery = enhancedQuery !== query;
  const registryMetadata = UnifiedSmartRouter.extractAndFlattenMetadata(enhancedQuery);

  // 2. Check for YouTube video queries
  const isVideoQuery = await isVideoOnlyQuery(query, conversationHistory);
  let finalQuery = enhancedQuery;

  // Run backend topic classifiers for smart routing and grounding
  const academicClass = classifyAcademicQuery(query);
  const discussionClass = classifyDiscussionQuery(query);
  const newsClass = classifyNewsQuery(query);
  const weatherClass = classifyWeatherQuery(query);
  const medicalClass = classifyMedicalQuery(query);
  const foodClass = classifyFoodQuery(query);
  const legalClass = classifyLegalQuery(query);
  const patentClass = classifyPatentQuery(query);
  const securityClass = classifySecurityQuery(query);
  const govFinanceClass = classifyGovFinanceQuery(query);
  const realEstateClass = classifyRealEstateQuery(query);
  const economicsClass = classifyEconomicsQuery(query);
  const biologyClass = classifyBiologyQuery(query);
  const entertainmentClass = classifyEntertainmentQuery(query);
  const travelClass = classifyTravelQuery(query);
  const shoppingClass = classifyShoppingQuery(query);
  const careerClass = classifyCareerQuery(query);
  const automotiveClass = classifyAutomotiveQuery(query);
  const gamingClass = classifyGamingQuery(query);
  const environmentClass = classifyEnvironmentQuery(query);
  const localClass = classifyLocalQuery(query);
  const educationClass = classifyEducationQuery(query);
  const diyClass = classifyDIYQuery(query);
  const spaceAviationClass = classifySpaceAviationQuery(query);
  const historyClass = classifyHistoryQuery(query);
  const artDesignClass = classifyArtDesignQuery(query);
  const philosophyClass = classifyPhilosophyQuery(query);
  const musicClass = classifyMusicQuery(query);
  const petsClass = classifyPetsQuery(query);
  const geopoliticsClass = classifyGeopoliticsQuery(query);
  const architectureClass = classifyArchitectureQuery(query);
  const agricultureClass = classifyAgricultureQuery(query);
  const chemistryClass = classifyChemistryQuery(query);
  const hobbiesClass = classifyHobbiesQuery(query);
  const logisticsClass = classifyLogisticsQuery(query);
  const personalFinanceClass = classifyPersonalFinanceQuery(query);
  const cryptoClass = classifyCryptoQuery(query);
  const fitnessClass = classifyFitnessQuery(query);
  const psychologyClass = classifyPsychologyQuery(query);
  const insuranceClass = classifyInsuranceQuery(query);
  const roboticsClass = classifyRoboticsQuery(query);
  const ticketingClass = classifyTicketingQuery(query);
  const astronomyClass = classifyAstronomyQuery(query);
  const anthropologyClass = classifyAnthropologyQuery(query);
  const linguisticsClass = classifyLinguisticsQuery(query);
  const pediatricsClass = classifyPediatricsQuery(query);
  const sustainabilityClass = classifySustainabilityQuery(query);
  const dropshippingClass = classifyDropshippingQuery(query);
  const civilLawClass = classifyCivilLawQuery(query);
  const pedagogyClass = classifyPedagogyQuery(query);
  const veterinaryClass = classifyVeterinaryQuery(query);
  const meteorologyClass = classifyMeteorologyQuery(query);
  const urbanPlanningClass = classifyUrbanPlanningQuery(query);
  const foodChemistryClass = classifyFoodChemistryQuery(query);
  const marineBiologyClass = classifyMarineBiologyQuery(query);
  const theoreticalPhysicsClass = classifyTheoreticalPhysicsQuery(query);
  const paleontologyClass = classifyPaleontologyQuery(query);
  const biomedicalClass = classifyBiomedicalQuery(query);
  const climatologyClass = classifyClimatologyQuery(query);
  const neurotechClass = classifyNeurotechQuery(query);
  const astrobiologyClass = classifyAstrobiologyQuery(query);
  const nanotechClass = classifyNanotechQuery(query);
  const nuclearClass = classifyNuclearQuery(query);
  const geneticsClass = classifyGeneticsQuery(query);
  const ventureCapitalClass = classifyVentureCapitalQuery(query);
  const digitalHumanitiesClass = classifyDigitalHumanitiesQuery(query);
  const virologyClass = classifyVirologyQuery(query);
  const quantumComputingClass = classifyQuantumComputingQuery(query);
  const metallurgyClass = classifyMetallurgyQuery(query);
  const organicChemistryClass = classifyOrganicChemistryQuery(query);
  const gridInfrastructureClass = classifyGridInfrastructureQuery(query);
  const mlopsClass = classifyMLOpsQuery(query);
  const fluidDynamicsClass = classifyFluidDynamicsQuery(query);
  const endocrinologyClass = classifyEndocrinologyQuery(query);
  const cryptographyClass = classifyCryptographyQuery(query);
  const behavioralEconomicsClass = classifyBehavioralEconomicsQuery(query);
  const seismologyClass = classifySeismologyQuery(query);
  const compilerDesignClass = classifyCompilerDesignQuery(query);

  if (academicClass.isAcademic) {
    console.log('🎓 Academic query detected. Appending scientific site-restrictions...');
    finalQuery = `${finalQuery} (site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov OR site:scholar.google.com OR site:nature.com OR site:researchgate.net OR site:ieee.org)`;
  } else if (discussionClass.isDiscussion) {
    console.log('💬 Discussion query detected. Appending community site-restrictions...');
    finalQuery = `${finalQuery} (site:reddit.com OR site:news.ycombinator.com OR site:quora.com OR site:producthunt.com)`;
  } else if (weatherClass.isWeather) {
    console.log('☀️ Weather query detected. Appending meteorological site-restrictions...');
    finalQuery = `${finalQuery} (site:weather.gov OR site:noaa.gov OR site:accuweather.com OR site:weather.com)`;
  } else if (newsClass.isNews) {
    console.log('📰 News query detected. Appending news freshness context...');
    finalQuery = `${finalQuery} news latest`;
  } else if (medicalClass.isMedical) {
    console.log('⚕️ Medical/Health query detected. Appending health site-restrictions...');
    finalQuery = `${finalQuery} (site:nih.gov OR site:fda.gov OR site:who.int OR site:cdc.gov OR site:pubmed.ncbi.nlm.nih.gov)`;
  } else if (foodClass.isFood) {
    console.log('🍎 Food/Nutrition query detected. Appending food data site-restrictions...');
    finalQuery = `${finalQuery} (site:usda.gov OR site:openfoodfacts.org OR site:fda.gov)`;
  } else if (legalClass.isLegal) {
    console.log('⚖️ Legal query detected. Appending legal site-restrictions...');
    finalQuery = `${finalQuery} (site:courtlistener.com OR site:justia.com OR site:oyez.org OR site:findlaw.com)`;
  } else if (patentClass.isPatent) {
    console.log('💡 Patent query detected. Appending patent site-restrictions...');
    finalQuery = `${finalQuery} (site:patents.google.com OR site:uspto.gov OR site:patentsview.org)`;
  } else if (securityClass.isSecurity) {
    console.log('🔒 Cybersecurity query detected. Appending vulnerability site-restrictions...');
    finalQuery = `${finalQuery} (site:nvd.nist.gov OR site:cisa.gov OR site:cve.org OR site:mitre.org)`;
  } else if (govFinanceClass.isGovFinance) {
    console.log('🏛️ Gov Finance query detected. Appending fiscal site-restrictions...');
    finalQuery = `${finalQuery} (site:fiscaldata.treasury.gov OR site:usaspending.gov OR site:sam.gov)`;
  } else if (realEstateClass.isRealEstate) {
    console.log('🏢 Real Estate query detected. Appending building permit site-restrictions...');
    finalQuery = `${finalQuery} (site:census.gov OR site:zillow.com OR site:redfin.com)`;
  } else if (economicsClass.isEconomics) {
    console.log('📊 Macroeconomics query detected. Appending economic data site-restrictions...');
    finalQuery = `${finalQuery} (site:worldbank.org OR site:imf.org OR site:oecd.org OR site:bls.gov OR site:bea.gov)`;
  } else if (biologyClass.isBiology) {
    console.log('🧬 Biology/Genomics query detected. Appending scientific databases site-restrictions...');
    finalQuery = `${finalQuery} (site:uniprot.org OR site:ensembl.org OR site:ncbi.nlm.nih.gov OR site:rcsb.org OR site:gnomad.broadinstitute.org)`;
  } else if (entertainmentClass.isEntertainment) {
    console.log('🎬 Entertainment/Pop Culture query detected. Appending showbusiness site-restrictions...');
    finalQuery = `${finalQuery} (site:imdb.com OR site:rottentomatoes.com OR site:spotify.com OR site:billboard.com OR site:metacritic.com)`;
  } else if (travelClass.isTravel) {
    console.log('✈️ Travel/Hospitality query detected. Appending hospitality site-restrictions...');
    finalQuery = `${finalQuery} (site:tripadvisor.com OR site:booking.com OR site:expedia.com OR site:airbnb.com OR site:lonelyplanet.com)`;
  } else if (shoppingClass.isShopping) {
    console.log('🛍️ Product Shopping query detected. Appending e-commerce site-restrictions...');
    finalQuery = `${finalQuery} (site:amazon.com OR site:bestbuy.com OR site:ebay.com OR site:target.com OR site:walmart.com)`;
  } else if (careerClass.isCareer) {
    console.log('💼 Job/Career query detected. Appending job portal site-restrictions...');
    finalQuery = `${finalQuery} (site:linkedin.com OR site:indeed.com OR site:glassdoor.com OR site:ziprecruiter.com OR site:salary.com)`;
  } else if (automotiveClass.isAutomotive) {
    console.log('🚗 Automotive/Vehicle query detected. Appending automotive specs site-restrictions...');
    finalQuery = `${finalQuery} (site:kbb.com OR site:edmunds.com OR site:caranddriver.com OR site:carfax.com OR site:motortrend.com)`;
  } else if (gamingClass.isGaming) {
    console.log('🎮 Gaming/Esports query detected. Appending gaming site-restrictions...');
    finalQuery = `${finalQuery} (site:ign.com OR site:gamespot.com OR site:twitch.tv OR site:steampowered.com OR site:liquipedia.net)`;
  } else if (environmentClass.isEnvironment) {
    console.log('🌱 Environment/Energy query detected. Appending environmental site-restrictions...');
    finalQuery = `${finalQuery} (site:epa.gov OR site:eia.gov OR site:usgs.gov OR site:climate.gov OR site:nrel.gov)`;
  } else if (localClass.isLocal) {
    console.log('📍 Local Services/Dining query detected. Appending local site-restrictions...');
    finalQuery = `${finalQuery} (site:yelp.com OR site:tripadvisor.com OR site:opentable.com OR site:foursquare.com OR site:yellowpages.com)`;
  } else if (educationClass.isEducation) {
    console.log('📚 Education/Parenting query detected. Appending educational site-restrictions...');
    finalQuery = `${finalQuery} (site:khanacademy.org OR site:coursera.org OR site:edx.org OR site:niche.com OR site:greatschools.org)`;
  } else if (diyClass.isDIY) {
    console.log('🛠️ DIY/Gardening query detected. Appending DIY site-restrictions...');
    finalQuery = `${finalQuery} (site:homedepot.com OR site:lowes.com OR site:almanac.com OR site:instructables.com OR site:houzz.com)`;
  } else if (spaceAviationClass.isSpaceAviation) {
    console.log('🚀 Space/Aviation query detected. Appending airspace/space launch site-restrictions...');
    finalQuery = `${finalQuery} (site:aviationstack.com OR site:nasa.gov OR site:spacex.com OR site:flightradar24.com OR site:faa.gov)`;
  } else if (historyClass.isHistory) {
    console.log('📜 History/Genealogy query detected. Appending historical site-restrictions...');
    finalQuery = `${finalQuery} (site:archive.org OR site:archives.gov OR site:ancestry.com OR site:history.com OR site:loc.gov OR site:britannica.com)`;
  } else if (artDesignClass.isArtDesign) {
    console.log('🎨 Art/Design/Fashion query detected. Appending design site-restrictions...');
    finalQuery = `${finalQuery} (site:behance.net OR site:dribbble.com OR site:artstation.com OR site:archdaily.com OR site:vogue.com OR site:metmuseum.org OR site:moma.org)`;
  } else if (philosophyClass.isPhilosophy) {
    console.log('🧠 Philosophy/Religion query detected. Appending spiritual site-restrictions...');
    finalQuery = `${finalQuery} (site:plato.stanford.edu OR site:iep.utm.edu OR site:biblegateway.com OR site:quran.com OR site:sacred-texts.com)`;
  } else if (musicClass.isMusic) {
    console.log('🎵 Music/Audio query detected. Appending acoustics site-restrictions...');
    finalQuery = `${finalQuery} (site:genius.com OR site:ultimate-guitar.com OR site:soundonsound.com OR site:gearnews.com OR site:musicradar.com OR site:discogs.com)`;
  } else if (petsClass.isPets) {
    console.log('🐾 Pets/Animals query detected. Appending veterinary site-restrictions...');
    finalQuery = `${finalQuery} (site:akc.org OR site:catster.com OR site:petmd.com OR site:aspca.org OR site:avma.org)`;
  } else if (geopoliticsClass.isGeopolitics) {
    console.log('🗺️ Geopolitics/Defense query detected. Appending geopolitical site-restrictions...');
    finalQuery = `${finalQuery} (site:defense.gov OR site:militarytimes.com OR site:globalsecurity.org OR site:defensenews.com OR site:janes.com)`;
  } else if (architectureClass.isArchitecture) {
    console.log('🏗️ Architecture/Engineering query detected. Appending architecture site-restrictions...');
    finalQuery = `${finalQuery} (site:archdaily.com OR site:enr.com OR site:asce.org OR site:engineering.com OR site:iccsafe.org)`;
  } else if (agricultureClass.isAgriculture) {
    console.log('🌾 Agriculture/Agronomy query detected. Appending agricultural site-restrictions...');
    finalQuery = `${finalQuery} (site:usda.gov OR site:fao.org OR site:agweb.com OR site:modernfarmer.com OR site:agri-pulse.com)`;
  } else if (chemistryClass.isChemistry) {
    console.log('🧪 Chemistry/Materials Science query detected. Appending chemical site-restrictions...');
    finalQuery = `${finalQuery} (site:pubchem.ncbi.nlm.nih.gov OR site:chemspider.com OR site:commonchemistry.org OR site:sigmaaldrich.com OR site:rsc.org)`;
  } else if (hobbiesClass.isHobbies) {
    console.log('🎲 Hobbies/Collectibles query detected. Appending hobby site-restrictions...');
    finalQuery = `${finalQuery} (site:boardgamegeek.com OR site:dpreview.com OR site:tcgplayer.com OR site:psacard.com OR site:instructables.com)`;
  } else if (logisticsClass.isLogistics) {
    console.log('🚢 Maritime/Logistics query detected. Appending logistics site-restrictions...');
    finalQuery = `${finalQuery} (site:marinetraffic.com OR site:joc.com OR site:shippingwatch.com OR site:freightwaves.com OR site:portoflosangeles.org)`;
  } else if (personalFinanceClass.isPersonalFinance) {
    console.log('💵 Personal Finance/Taxation query detected. Appending personal finance site-restrictions...');
    finalQuery = `${finalQuery} (site:irs.gov OR site:nerdwallet.com OR site:investopedia.com OR site:creditkarma.com OR site:bankrate.com)`;
  } else if (cryptoClass.isCrypto) {
    console.log('🪙 Crypto/Blockchain query detected. Appending crypto site-restrictions...');
    finalQuery = `${finalQuery} (site:coinmarketcap.com OR site:coingecko.com OR site:etherscan.io OR site:coindesk.com OR site:cointelegraph.com OR site:decrypt.co)`;
  } else if (fitnessClass.isFitness) {
    console.log('💪 Fitness/Exercise query detected. Appending fitness site-restrictions...');
    finalQuery = `${finalQuery} (site:bodybuilding.com OR site:healthline.com OR site:muscleandfitness.com OR site:runnersworld.com OR site:crossfit.com OR site:verywellfit.com)`;
  } else if (psychologyClass.isPsychology) {
    console.log('🧠 Psychology/Cognitive Science query detected. Appending psychology site-restrictions...');
    finalQuery = `${finalQuery} (site:psychologytoday.com OR site:apa.org OR site:simplypsychology.org OR site:ncbi.nlm.nih.gov/pmc OR site:frontiersin.org OR site:sciencedirect.com)`;
  } else if (insuranceClass.isInsurance) {
    console.log('🛡️ Insurance/Risk Management query detected. Appending insurance site-restrictions...');
    finalQuery = `${finalQuery} (site:healthcare.gov OR site:progressive.com OR site:geico.com OR site:statefarm.com OR site:allstate.com OR site:naic.org OR site:iii.org)`;
  } else if (roboticsClass.isRobotics) {
    console.log('🤖 Manufacturing & Robotics query detected. Appending manufacturing site-restrictions...');
    finalQuery = `${finalQuery} (site:robotics.org OR site:machinedesign.com OR site:thomasnet.com OR site:controlglobal.com OR site:3dprinting.com OR site:automation.com)`;
  } else if (ticketingClass.isTicketing) {
    console.log('🎟️ Event Ticketing & Live Shows query detected. Appending ticketing site-restrictions...');
    finalQuery = `${finalQuery} (site:ticketmaster.com OR site:stubhub.com OR site:seatgeek.com OR site:livenation.com OR site:broadway.com OR site:vividseats.com)`;
  } else if (astronomyClass.isAstronomy) {
    console.log('🌌 Astronomy & Astrophysics query detected. Appending astronomy site-restrictions...');
    finalQuery = `${finalQuery} (site:nasa.gov OR site:esa.int OR site:hubblesite.org OR site:stsci.edu OR site:space.com OR site:astronomy.com OR site:arxiv.org/archive/astro-ph)`;
  } else if (anthropologyClass.isAnthropology) {
    console.log('🏺 Anthropology & Archaeology query detected. Appending anthropology site-restrictions...');
    finalQuery = `${finalQuery} (site:archaeology.org OR site:nationalgeographic.com OR site:smithsonianmag.com OR site:nature.com OR site:worldhistory.org OR site:anthropology-news.org)`;
  } else if (linguisticsClass.isLinguistics) {
    console.log('🗣️ Linguistics & Etymology query detected. Appending linguistics site-restrictions...');
    finalQuery = `${finalQuery} (site:etymonline.com OR site:linguistlist.org OR site:wals.info OR site:ethnologue.com OR site:sil.org OR site:cambridge.org/core/journals/linguistics)`;
  } else if (pediatricsClass.isPediatrics) {
    console.log('👶 Pediatrics & Childcare query detected. Appending child-care site-restrictions...');
    finalQuery = `${finalQuery} (site:aap.org OR site:healthychildren.org OR site:cdc.gov/ncbddd/childdevelopment OR site:mayoclinic.org OR site:webmd.com/parenting OR site:whattoexpect.com)`;
  } else if (sustainabilityClass.isSustainability) {
    console.log('♻️ Renewable Energy & Sustainability query detected. Appending sustainability site-restrictions...');
    finalQuery = `${finalQuery} (site:nrel.gov OR site:iea.org OR site:irena.org OR site:seia.org OR site:energy.gov OR site:sustainability.com OR site:clean-energy.org)`;
  } else if (dropshippingClass.isDropshipping) {
    console.log('📦 Wholesale Sourcing & Dropshipping query detected. Appending dropshipping site-restrictions...');
    finalQuery = `${finalQuery} (site:alibaba.com OR site:shopify.com OR site:spocket.co OR site:salehoo.com OR site:worldwidebrands.com OR site:thomasnet.com)`;
  } else if (civilLawClass.isCivilLaw) {
    console.log('⚖️ Civil Law & Torts query detected. Appending civil law site-restrictions...');
    finalQuery = `${finalQuery} (site:courtlistener.com OR site:justia.com OR site:findlaw.com OR site:law.cornell.edu OR site:scotusblog.com OR site:nolo.com)`;
  } else if (pedagogyClass.isPedagogy) {
    console.log('🍎 Pedagogy & Instructional Design query detected. Appending pedagogy site-restrictions...');
    finalQuery = `${finalQuery} (site:edutopia.org OR site:ascd.org OR site:ed.gov OR site:instructionaldesign.org OR site:coursera.org OR site:facultyfocus.com)`;
  } else if (veterinaryClass.isVeterinary) {
    console.log('🐾 Veterinary Medicine & Pathology query detected. Appending veterinary site-restrictions...');
    finalQuery = `${finalQuery} (site:avma.org OR site:vin.com OR site:petmd.com OR site:merckvetmanual.com OR site:veterinarypartner.com OR site:aaha.org)`;
  } else if (meteorologyClass.isMeteorology) {
    console.log('⛈️ Meteorology & Synoptic Forecasting query detected. Appending meteorology site-restrictions...');
    finalQuery = `${finalQuery} (site:weather.gov OR site:noaa.gov OR site:spc.noaa.gov OR site:nhc.noaa.gov OR site:wmo.int OR site:ecmwf.int)`;
  } else if (urbanPlanningClass.isUrbanPlanning) {
    console.log('🗺️ Urban Planning & GIS query detected. Appending urban planning site-restrictions...');
    finalQuery = `${finalQuery} (site:planning.org OR site:esri.com OR site:hud.gov OR site:smartcitiesworld.net OR site:citylab.com OR site:urban.org)`;
  } else if (foodChemistryClass.isFoodChemistry) {
    console.log('🍳 Molecular Gastronomy & Food Chemistry query detected. Appending molecular gastronomy site-restrictions...');
    finalQuery = `${finalQuery} (site:foodscience.org OR site:ift.org OR site:seriouseats.com OR site:modernistcuisine.com OR site:scienceofcooking.com OR site:khymos.org)`;
  } else if (marineBiologyClass.isMarineBiology) {
    console.log('🐳 Marine Biology & Oceanography query detected. Appending marine biology site-restrictions...');
    finalQuery = `${finalQuery} (site:noaa.gov OR site:mbari.org OR site:whoi.edu OR site:marinebio.org OR site:sciencedirect.com OR site:nature.com)`;
  } else if (theoreticalPhysicsClass.isTheoreticalPhysics) {
    console.log('⚛️ Theoretical Physics & Quantum Mechanics query detected. Appending theoretical physics site-restrictions...');
    finalQuery = `${finalQuery} (site:arxiv.org OR site:cern.ch OR site:aps.org OR site:physicsworld.com OR site:nature.com OR site:quantum-journal.org)`;
  } else if (paleontologyClass.isPaleontology) {
    console.log('🦕 Paleontology & Evolutionary Biology query detected. Appending paleontology site-restrictions...');
    finalQuery = `${finalQuery} (site:paleosoc.org OR site:vertpaleo.org OR site:fossils-facts-and-finds.com OR site:nature.com OR site:ucmp.berkeley.edu OR site:amnh.org)`;
  } else if (biomedicalClass.isBiomedical) {
    console.log('🦾 Biomedical Engineering & Prosthetics query detected. Appending biomedical site-restrictions...');
    finalQuery = `${finalQuery} (site:embs.org OR site:bmes.org OR site:pubmed.ncbi.nlm.nih.gov OR site:nature.com OR site:sciencedirect.com OR site:asme.org)`;
  } else if (climatologyClass.isClimatology) {
    console.log('🌍 Climatology & Paleoclimatology query detected. Appending climatology site-restrictions...');
    finalQuery = `${finalQuery} (site:ipcc.ch OR site:ncdc.noaa.gov OR site:climate.nasa.gov OR site:wmo.int OR site:copernicus.eu OR site:nature.com)`;
  } else if (neurotechClass.isNeurotech) {
    console.log('🧠 Neurotechnology & BCI query detected. Appending neurotech site-restrictions...');
    finalQuery = `${finalQuery} (site:neurotechx.com OR site:frontiersin.org OR site:nature.com OR site:pubmed.ncbi.nlm.nih.gov OR site:ieee.org OR site:bci-info.org)`;
  } else if (astrobiologyClass.isAstrobiology) {
    console.log('🌌 Astrobiology & Planetary Habitability query detected. Appending astrobiology site-restrictions...');
    finalQuery = `${finalQuery} (site:nasa.gov OR site:astrobiology.nasa.gov OR site:nature.com OR site:liebertpub.com/ast OR site:planetary.org OR site:sciencedirect.com)`;
  } else if (nanotechClass.isNanotech) {
    console.log('🔬 Nanotechnology & Nanomaterials query detected. Appending nanotech site-restrictions...');
    finalQuery = `${finalQuery} (site:nano.gov OR site:nature.com/nano OR site:nanotechweb.org OR site:sciencedirect.com OR site:ieee.org OR site:acs.org)`;
  } else if (nuclearClass.isNuclear) {
    console.log('⚛️ Nuclear Engineering & Fusion Technology query detected. Appending nuclear engineering site-restrictions...');
    finalQuery = `${finalQuery} (site:iaea.org OR site:ans.org OR site:world-nuclear.org OR site:iter.org OR site:sciencedirect.com OR site:nature.com)`;
  } else if (geneticsClass.isGenetics) {
    console.log('🧬 Genetics & CRISPR Gene Editing query detected. Appending gene-editing site-restrictions...');
    finalQuery = `${finalQuery} (site:broadinstitute.org OR site:nature.com/nrg OR site:pubmed.ncbi.nlm.nih.gov OR site:crisprjournal.com OR site:sciencedirect.com OR site:cell.com)`;
  } else if (ventureCapitalClass.isVentureCapital) {
    console.log('💼 Venture Capital & Startup Finance query detected. Appending venture capital site-restrictions...');
    finalQuery = `${finalQuery} (site:nvca.org OR site:crunchbase.com OR site:pitchbook.com OR site:ycombinator.com OR site:sec.gov OR site:venturebeat.com)`;
  } else if (digitalHumanitiesClass.isDigitalHumanities) {
    console.log('📜 Digital Humanities & Cultural Heritage query detected. Appending digital humanities site-restrictions...');
    finalQuery = `${finalQuery} (site:dh.org OR site:digitalhumanities.org OR site:ach.org OR site:mith.umd.edu OR site:loc.gov OR site:ox.ac.uk/research/digital-humanities)`;
  } else if (virologyClass.isVirology) {
    console.log('🦠 Virology & Immunology query detected. Appending virology site-restrictions...');
    finalQuery = `${finalQuery} (site:nature.com/nri OR site:pubmed.ncbi.nlm.nih.gov OR site:virology.ws OR site:cell.com/immunity OR site:who.int OR site:cdc.gov)`;
  } else if (quantumComputingClass.isQuantumComputing) {
    console.log('💻 Quantum Computing & Information query detected. Appending quantum computing site-restrictions...');
    finalQuery = `${finalQuery} (site:arxiv.org/archive/quant-ph OR site:quantum-journal.org OR site:nature.com/npjqi OR site:ieee.org OR site:sciencedirect.com OR site:aps.org)`;
  } else if (metallurgyClass.isMetallurgy) {
    console.log('🔬 Materials Science & Metallurgy query detected. Appending materials science site-restrictions...');
    finalQuery = `${finalQuery} (site:materialsscience.org OR site:nature.com/nmat OR site:sciencedirect.com OR site:metallurgy.org OR site:springer.com OR site:asminternational.org)`;
  } else if (organicChemistryClass.isOrganicChemistry) {
    console.log('🧪 Organic Chemistry & Drug Synthesis query detected. Appending organic chemistry site-restrictions...');
    finalQuery = `${finalQuery} (site:acs.org OR site:rsc.org OR site:sciencedirect.com OR site:nature.com/nchem OR site:chemspider.com OR site:organic-chemistry.org)`;
  } else if (gridInfrastructureClass.isGridInfrastructure) {
    console.log('⚡ Renewable Grid Infrastructure query detected. Appending grid infrastructure site-restrictions...');
    finalQuery = `${finalQuery} (site:ieee.org OR site:energy.gov OR site:epri.com OR site:nrel.gov OR site:cigre.org OR site:sciencedirect.com)`;
  } else if (mlopsClass.isMLOps) {
    console.log('🤖 MLOps query detected. Appending MLOps site-restrictions...');
    finalQuery = `${finalQuery} (site:mlops.community OR site:arxiv.org OR site:medium.com/tag/mlops OR site:github.com OR site:kubernetes.io OR site:huggingface.co)`;
  } else if (fluidDynamicsClass.isFluidDynamics) {
    console.log('✈️ Computational Fluid Dynamics query detected. Appending CFD site-restrictions...');
    finalQuery = `${finalQuery} (site:cfd-online.com OR site:nasa.gov OR site:arxiv.org/archive/physics.flu-dyn OR site:sciencedirect.com OR site:journals.aps.org/prfluids OR site:ieee.org)`;
  } else if (endocrinologyClass.isEndocrinology) {
    console.log('🩸 Endocrinology query detected. Appending endocrinology site-restrictions...');
    finalQuery = `${finalQuery} (site:endocrine.org OR site:ncbi.nlm.nih.gov/pmc OR site:nature.com/nrendo OR site:who.int OR site:pubmed.ncbi.nlm.nih.gov OR site:diabetesjournals.org)`;
  } else if (cryptographyClass.isCryptography) {
    console.log('🔐 Cryptography query detected. Appending cryptography site-restrictions...');
    finalQuery = `${finalQuery} (site:iacr.org OR site:arxiv.org/archive/cs.cr OR site:nist.gov OR site:crypto.stackexchange.com OR site:github.com OR site:schneier.com)`;
  } else if (behavioralEconomicsClass.isBehavioralEconomics) {
    console.log('📈 Behavioral Economics query detected. Appending behavioral economics site-restrictions...');
    finalQuery = `${finalQuery} (site:nber.org OR site:nobelprize.org OR site:sciencedirect.com OR site:aeaweb.org OR site:behavioraleconomics.com OR site:nature.com/nature-human-behaviour)`;
  } else if (seismologyClass.isSeismology) {
    console.log('🌋 Seismology & Volcanology query detected. Appending seismology site-restrictions...');
    finalQuery = `${finalQuery} (site:usgs.gov OR site:iris.edu OR site:volcano.si.edu OR site:sciencedirect.com OR site:nature.com/ngeo OR site:agu.org)`;
  } else if (compilerDesignClass.isCompilerDesign) {
    console.log('💻 Compiler Design & PLT query detected. Appending compiler design site-restrictions...');
    finalQuery = `${finalQuery} (site:llvm.org OR site:arxiv.org/archive/cs.PL OR site:github.com OR site:gcc.gnu.org OR site:sigplan.org OR site:dspace.mit.edu)`;
  }

  let videoReferences = [];
  let videoCitations = [];

  if (isVideoQuery) {
    console.log('📹 Detected video query. Performing YouTube search...');
    try {
      const videoCount = await extractVideoCount(query, conversationHistory);
      const videos = await searchYouTube(query, videoCount, conversationHistory);
      
      if (videos && videos.length > 0) {
        console.log(`Found ${videos.length} videos from YouTube`);
        
        const videoResultsBlock = `
[SYSTEM INSTRUCTION - ACTIVE ELITE YOUTUBE SEARCH]
YouTube Video Search Results:
${videos.map((vid, idx) => `
Video #${idx + 1}:
- Title: ${vid.title}
- Channel: ${vid.channelTitle}
- URL: ${vid.url}
- Description: ${vid.description}
- Published At: ${vid.publishedAt}
`).join('\n')}

INSTRUCTIONS FOR ULTIMATE SPEED & CITATION ACCURACY:
- Output a direct, simple, and straightforward response recommending/summarizing these videos.
- Never include conversational preambles ("Here are the videos...", "According to YouTube...").
- Highlight key videos with their titles in bold.
- Explicitly include source citation at the very top: "[Source: YouTube Search Service]".
- Format with neat bullet points, displaying the video title, channel, description, and direct link.
- Strictly stick to the provided YouTube video data.
`;
        
        finalQuery = `${videoResultsBlock}\n\nUser Request: ${query}`;
        
        videoReferences = videos.map((vid) => ({
          url: vid.url,
          domain: 'youtube.com',
          title: vid.title,
        }));
        
        videoCitations = videos.map((vid, index) => ({
          index: index + 1,
          url: vid.url,
          domain: 'youtube.com',
          title: vid.title,
        }));
      }
    } catch (err) {
      console.error('Error during YouTube search integration:', err);
    }
  }

  // 3. Check for GCP repository references from our local 1,388 catalog
  let gcpCatalogReferences = [];
  let gcpResultsBlock = '';
  const gcpKeywords = ['gcp', 'google cloud', 'submodule', 'import', 'google repository', 'google repo', 'appengine', 'cloud storage', 'compute engine', 'bigquery', 'cloud run', 'kubernetes', 'gke', 'terraform'];
  const isGcpRelated = gcpKeywords.some(keyword => query.toLowerCase().includes(keyword));

  if (isGcpRelated) {
    console.log('☁️ Query is GCP-related. Searching local GCP 1,388 open source catalog...');
    try {
      const searchResult = await GcpNativeService.searchGcpCatalog(query, { limit: 5 });
      if (searchResult.success && searchResult.results.length > 0) {
        console.log(`Found ${searchResult.results.length} matching GCP repositories from catalog!`);
        gcpCatalogReferences = searchResult.results.map(repo => ({
          url: repo.html_url,
          domain: repo.domain || (repo.org === 'google' ? 'github.com/google' : 'github.com/GoogleCloudPlatform'),
          title: `${repo.name} (${repo.language}) - ${repo.license} License`,
          clone_url: repo.clone_url,
          stars: repo.stars,
          forks: repo.forks,
          description: repo.description
        }));

        gcpResultsBlock = `
[SYSTEM INSTRUCTION - ACTIVE ELITE GOOGLE OPEN SOURCE CATALOG RETRIEVAL]
The following 100% verified, production-grade repositories were found in our pre-compiled Google & Google Cloud open-source catalog. These are officially licensed under MIT/Apache-2.0:

${searchResult.results.map((repo, idx) => `
Repository #${idx + 1}:
- Name: ${repo.name}
- Organization: ${repo.org || 'GoogleCloudPlatform'}
- Language: ${repo.language}
- Stars: ${repo.stars} | Forks: ${repo.forks}
- License: ${repo.license}
- GitHub URL: ${repo.html_url}
- Clone Command: git clone ${repo.clone_url}
- Description: ${repo.description || 'No description provided.'}
`).join('\n')}

INSTRUCTIONS FOR HARNESSING THESE BLUEPRINTS:
1. Synthesize your architectural and setup advice by drawing directly from these verified repositories.
2. Under your response, present these repositories as beautiful reference links or code blocks for the user.
3. Make sure to highlight that these are fully compliant open-source blueprints from Google and Google Cloud.
4. Keep the answer highly truthful, exact, and grounded in these repositories.
`;
        
        finalQuery = `${gcpResultsBlock}\n\n${finalQuery}`;
      }
    } catch (err) {
      console.error('Error querying GCP catalog in grounding service:', err);
    }
  }

  const MAX_RETRIES = 3;
  let attemptCount = 0;

  while (attemptCount < MAX_RETRIES) {
    attemptCount++;

    try {
      const startTime = Date.now();

      // Token management: Check if history needs semantic compression
      const TOKEN_LIMIT = 6000;
      const QUERY_TOKEN_RESERVE = 2000;
      const MAX_HISTORY_TOKENS = TOKEN_LIMIT - QUERY_TOKEN_RESERVE;

      let processedHistory = conversationHistory;
      const historyTokens = await estimateTokens(conversationHistory);

      console.log(
        `📊 History tokens: ${historyTokens} / ${MAX_HISTORY_TOKENS}`
      );

      if (historyTokens > MAX_HISTORY_TOKENS) {
        console.log(
          `⚠️ History exceeds token limit (${historyTokens} > ${MAX_HISTORY_TOKENS}), compressing semantically...`
        );
        processedHistory = await compressHistorySemantically(conversationHistory, ai);

        const summaryTokens = estimateTokens(processedHistory);
        if (summaryTokens > MAX_HISTORY_TOKENS) {
          console.log(
            `⚠️ Summary still too large, truncating to last message only`
          );
          processedHistory = conversationHistory.slice(-1);
        }
      }

      // Build contents with proper format for Google GenAI
      const contents = [
        ...processedHistory.map((msg) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        })),
        {
          role: 'user',
          parts: [{ text: finalQuery }],
        },
      ];

      const stream = await ai.models.generateContentStream({
        model: 'gemini-3.5-flash',
        contents: contents,
        config: {
          temperature: 0.2,
          maxOutputTokens: 4000,
          systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
          thinkingConfig: {
            thinkingLevel: 'LOW',
          },
        },
      });

      let fullText = '';
      let groundingMetadata = null;
      let hasReceivedContent = false;

      // Stream chunks as they arrive
      for await (const chunk of stream) {
        if (chunk.candidates && chunk.candidates[0]) {
          const candidate = chunk.candidates[0];

          // Process each part in the chunk
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              // Handle thinking parts
              if (part.thought) {
                hasReceivedContent = true;
                console.log(`🧠 Streaming thinking chunk`);
                yield {
                  type: 'thinking',
                  content: part.thought,
                  timestamp: Date.now(),
                };
              }

              // Handle text parts
              if (part.text) {
                hasReceivedContent = true;
                fullText += part.text;
                console.log(
                  `💬 Streaming text chunk: ${part.text.substring(0, 50)}...`
                );
                yield {
                  type: 'text',
                  content: part.text,
                  timestamp: Date.now(),
                };
              }
            }
          }

          // Capture grounding metadata (usually in final chunk)
          if (candidate.groundingMetadata) {
            groundingMetadata = candidate.groundingMetadata;
          }
        }
      }

      const endTime = Date.now();
      console.log(`⏱️ Streaming search took ${endTime - startTime} ms`);

      // Check if we got content
      if (!hasReceivedContent || fullText.trim().length === 0) {
        console.warn(
          `⚠️ Attempt ${attemptCount}/${MAX_RETRIES}: Stream completed but no content received. Retrying...`
        );

        if (attemptCount < MAX_RETRIES) {
          const waitTime = Math.pow(2, attemptCount) * 1000;
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        } else {
          console.error(
            `❌ All ${MAX_RETRIES} attempts failed with empty streams`
          );
          throw new Error(
            'Model stream completed but no content received after 3 attempts'
          );
        }
      }

      // Stitch and deduplicate references and citations using our new engine
      const extraReferences = [
        ...(videoReferences || []),
        ...(gcpCatalogReferences || [])
      ];
      const { references: mergedReferences, citations: mergedCitations } = 
        UnifiedSmartRouter.stitchAndDeduplicateCitations(registryMetadata, groundingMetadata, extraReferences);

      const citationMetadata = groundingMetadata
        ? {
            searchQueries: groundingMetadata.webSearchQueries || [],
            searchTimestamp: new Date().toISOString(),
            model: 'gemini-3.5-flash',
            groundingSupports: groundingMetadata.groundingSupports?.length || 0,
            totalSources: groundingMetadata.groundingChunks?.length || 0,
            searchMethod: isVideoQuery ? 'youtube_search' : isFinancialQuery ? 'massive_realtime' : 'native_grounding',
          }
        : {
            searchTimestamp: new Date().toISOString(),
            searchMethod: isVideoQuery ? 'youtube_search' : isFinancialQuery ? 'massive_realtime' : 'native_grounding',
          };

      console.log(
        `✅ Streaming grounded search completed on attempt ${attemptCount}`
      );
      console.log(
        `📊 Used ${groundingMetadata?.webSearchQueries?.length || 0} search queries`
      );
      console.log(`📚 Found ${references.length} sources`);

      if (groundingMetadata?.webSearchQueries) {
        console.log(
          `🔎 Search queries used:`,
          groundingMetadata.webSearchQueries
        );
      }

      // Yield final metadata
      yield {
        type: 'metadata',
        answer: fullText,
        reference: mergedReferences,
        citations: mergedCitations,
        citationMetadata: citationMetadata,
        registryMetadata: registryMetadata,
        timestamp: Date.now(),
      };

      return; // Success, exit retry loop
    } catch (error) {
      console.error(
        `❌ Error in streaming grounded search (attempt ${attemptCount}/${MAX_RETRIES}):`,
        error
      );

      if (attemptCount >= MAX_RETRIES) {
        throw error;
      }

      const waitTime = Math.pow(2, attemptCount) * 1000;
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw new Error(
    'Unexpected: Exhausted all retry attempts without returning or throwing'
  );
}

/**
 * Execute a grounded search with Google's native tool (non-streaming)
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {Object} Formatted response with answer, references, and citations
 */
export async function executeGroundedSearch(query, conversationHistory = []) {
  console.log(`🔍 Executing grounded search: "${query}"`);

  // 1. Check for financial queries using massiveSmartRouter
  const enhancedQuery = await massiveSmartRouter.routeAndEnhancePrompt(query);
  const isFinancialQuery = enhancedQuery !== query;
  const registryMetadata = UnifiedSmartRouter.extractAndFlattenMetadata(enhancedQuery);

  // 2. Check for YouTube video queries
  const isVideoQuery = await isVideoOnlyQuery(query, conversationHistory);
  let finalQuery = enhancedQuery;

  // Run backend topic classifiers for smart routing and grounding
  const academicClass = classifyAcademicQuery(query);
  const discussionClass = classifyDiscussionQuery(query);
  const newsClass = classifyNewsQuery(query);
  const weatherClass = classifyWeatherQuery(query);
  const medicalClass = classifyMedicalQuery(query);
  const foodClass = classifyFoodQuery(query);
  const legalClass = classifyLegalQuery(query);
  const patentClass = classifyPatentQuery(query);
  const securityClass = classifySecurityQuery(query);
  const govFinanceClass = classifyGovFinanceQuery(query);
  const realEstateClass = classifyRealEstateQuery(query);
  const economicsClass = classifyEconomicsQuery(query);
  const biologyClass = classifyBiologyQuery(query);
  const entertainmentClass = classifyEntertainmentQuery(query);
  const travelClass = classifyTravelQuery(query);
  const shoppingClass = classifyShoppingQuery(query);
  const careerClass = classifyCareerQuery(query);
  const automotiveClass = classifyAutomotiveQuery(query);
  const gamingClass = classifyGamingQuery(query);
  const environmentClass = classifyEnvironmentQuery(query);
  const localClass = classifyLocalQuery(query);
  const educationClass = classifyEducationQuery(query);
  const diyClass = classifyDIYQuery(query);
  const spaceAviationClass = classifySpaceAviationQuery(query);
  const historyClass = classifyHistoryQuery(query);
  const artDesignClass = classifyArtDesignQuery(query);
  const philosophyClass = classifyPhilosophyQuery(query);
  const musicClass = classifyMusicQuery(query);
  const petsClass = classifyPetsQuery(query);
  const geopoliticsClass = classifyGeopoliticsQuery(query);
  const architectureClass = classifyArchitectureQuery(query);
  const agricultureClass = classifyAgricultureQuery(query);
  const chemistryClass = classifyChemistryQuery(query);
  const hobbiesClass = classifyHobbiesQuery(query);
  const logisticsClass = classifyLogisticsQuery(query);
  const personalFinanceClass = classifyPersonalFinanceQuery(query);
  const cryptoClass = classifyCryptoQuery(query);
  const fitnessClass = classifyFitnessQuery(query);
  const psychologyClass = classifyPsychologyQuery(query);
  const insuranceClass = classifyInsuranceQuery(query);
  const roboticsClass = classifyRoboticsQuery(query);
  const ticketingClass = classifyTicketingQuery(query);
  const astronomyClass = classifyAstronomyQuery(query);
  const anthropologyClass = classifyAnthropologyQuery(query);
  const linguisticsClass = classifyLinguisticsQuery(query);
  const pediatricsClass = classifyPediatricsQuery(query);
  const sustainabilityClass = classifySustainabilityQuery(query);
  const dropshippingClass = classifyDropshippingQuery(query);
  const civilLawClass = classifyCivilLawQuery(query);
  const pedagogyClass = classifyPedagogyQuery(query);
  const veterinaryClass = classifyVeterinaryQuery(query);
  const meteorologyClass = classifyMeteorologyQuery(query);
  const urbanPlanningClass = classifyUrbanPlanningQuery(query);
  const foodChemistryClass = classifyFoodChemistryQuery(query);
  const marineBiologyClass = classifyMarineBiologyQuery(query);
  const theoreticalPhysicsClass = classifyTheoreticalPhysicsQuery(query);
  const paleontologyClass = classifyPaleontologyQuery(query);
  const biomedicalClass = classifyBiomedicalQuery(query);
  const climatologyClass = classifyClimatologyQuery(query);
  const neurotechClass = classifyNeurotechQuery(query);
  const astrobiologyClass = classifyAstrobiologyQuery(query);
  const nanotechClass = classifyNanotechQuery(query);
  const nuclearClass = classifyNuclearQuery(query);
  const geneticsClass = classifyGeneticsQuery(query);
  const ventureCapitalClass = classifyVentureCapitalQuery(query);
  const digitalHumanitiesClass = classifyDigitalHumanitiesQuery(query);
  const virologyClass = classifyVirologyQuery(query);
  const quantumComputingClass = classifyQuantumComputingQuery(query);
  const metallurgyClass = classifyMetallurgyQuery(query);
  const organicChemistryClass = classifyOrganicChemistryQuery(query);
  const gridInfrastructureClass = classifyGridInfrastructureQuery(query);
  const mlopsClass = classifyMLOpsQuery(query);
  const fluidDynamicsClass = classifyFluidDynamicsQuery(query);
  const endocrinologyClass = classifyEndocrinologyQuery(query);
  const cryptographyClass = classifyCryptographyQuery(query);
  const behavioralEconomicsClass = classifyBehavioralEconomicsQuery(query);
  const seismologyClass = classifySeismologyQuery(query);
  const compilerDesignClass = classifyCompilerDesignQuery(query);

  if (academicClass.isAcademic) {
    console.log('🎓 Academic query detected. Appending scientific site-restrictions...');
    finalQuery = `${finalQuery} (site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov OR site:scholar.google.com OR site:nature.com OR site:researchgate.net OR site:ieee.org)`;
  } else if (discussionClass.isDiscussion) {
    console.log('💬 Discussion query detected. Appending community site-restrictions...');
    finalQuery = `${finalQuery} (site:reddit.com OR site:news.ycombinator.com OR site:quora.com OR site:producthunt.com)`;
  } else if (weatherClass.isWeather) {
    console.log('☀️ Weather query detected. Appending meteorological site-restrictions...');
    finalQuery = `${finalQuery} (site:weather.gov OR site:noaa.gov OR site:accuweather.com OR site:weather.com)`;
  } else if (newsClass.isNews) {
    console.log('📰 News query detected. Appending news freshness context...');
    finalQuery = `${finalQuery} news latest`;
  } else if (medicalClass.isMedical) {
    console.log('⚕️ Medical/Health query detected. Appending health site-restrictions...');
    finalQuery = `${finalQuery} (site:nih.gov OR site:fda.gov OR site:who.int OR site:cdc.gov OR site:pubmed.ncbi.nlm.nih.gov)`;
  } else if (foodClass.isFood) {
    console.log('🍎 Food/Nutrition query detected. Appending food data site-restrictions...');
    finalQuery = `${finalQuery} (site:usda.gov OR site:openfoodfacts.org OR site:fda.gov)`;
  } else if (legalClass.isLegal) {
    console.log('⚖️ Legal query detected. Appending legal site-restrictions...');
    finalQuery = `${finalQuery} (site:courtlistener.com OR site:justia.com OR site:oyez.org OR site:findlaw.com)`;
  } else if (patentClass.isPatent) {
    console.log('💡 Patent query detected. Appending patent site-restrictions...');
    finalQuery = `${finalQuery} (site:patents.google.com OR site:uspto.gov OR site:patentsview.org)`;
  } else if (securityClass.isSecurity) {
    console.log('🔒 Cybersecurity query detected. Appending vulnerability site-restrictions...');
    finalQuery = `${finalQuery} (site:nvd.nist.gov OR site:cisa.gov OR site:cve.org OR site:mitre.org)`;
  } else if (govFinanceClass.isGovFinance) {
    console.log('🏛️ Gov Finance query detected. Appending fiscal site-restrictions...');
    finalQuery = `${finalQuery} (site:fiscaldata.treasury.gov OR site:usaspending.gov OR site:sam.gov)`;
  } else if (realEstateClass.isRealEstate) {
    console.log('🏢 Real Estate query detected. Appending building permit site-restrictions...');
    finalQuery = `${finalQuery} (site:census.gov OR site:zillow.com OR site:redfin.com)`;
  } else if (economicsClass.isEconomics) {
    console.log('📊 Macroeconomics query detected. Appending economic data site-restrictions...');
    finalQuery = `${finalQuery} (site:worldbank.org OR site:imf.org OR site:oecd.org OR site:bls.gov OR site:bea.gov)`;
  } else if (biologyClass.isBiology) {
    console.log('🧬 Biology/Genomics query detected. Appending scientific databases site-restrictions...');
    finalQuery = `${finalQuery} (site:uniprot.org OR site:ensembl.org OR site:ncbi.nlm.nih.gov OR site:rcsb.org OR site:gnomad.broadinstitute.org)`;
  } else if (entertainmentClass.isEntertainment) {
    console.log('🎬 Entertainment/Pop Culture query detected. Appending showbusiness site-restrictions...');
    finalQuery = `${finalQuery} (site:imdb.com OR site:rottentomatoes.com OR site:spotify.com OR site:billboard.com OR site:metacritic.com)`;
  } else if (travelClass.isTravel) {
    console.log('✈️ Travel/Hospitality query detected. Appending hospitality site-restrictions...');
    finalQuery = `${finalQuery} (site:tripadvisor.com OR site:booking.com OR site:expedia.com OR site:airbnb.com OR site:lonelyplanet.com)`;
  } else if (shoppingClass.isShopping) {
    console.log('🛍️ Product Shopping query detected. Appending e-commerce site-restrictions...');
    finalQuery = `${finalQuery} (site:amazon.com OR site:bestbuy.com OR site:ebay.com OR site:target.com OR site:walmart.com)`;
  } else if (careerClass.isCareer) {
    console.log('💼 Job/Career query detected. Appending job portal site-restrictions...');
    finalQuery = `${finalQuery} (site:linkedin.com OR site:indeed.com OR site:glassdoor.com OR site:ziprecruiter.com OR site:salary.com)`;
  } else if (automotiveClass.isAutomotive) {
    console.log('🚗 Automotive/Vehicle query detected. Appending automotive specs site-restrictions...');
    finalQuery = `${finalQuery} (site:kbb.com OR site:edmunds.com OR site:caranddriver.com OR site:carfax.com OR site:motortrend.com)`;
  } else if (gamingClass.isGaming) {
    console.log('🎮 Gaming/Esports query detected. Appending gaming site-restrictions...');
    finalQuery = `${finalQuery} (site:ign.com OR site:gamespot.com OR site:twitch.tv OR site:steampowered.com OR site:liquipedia.net)`;
  } else if (environmentClass.isEnvironment) {
    console.log('🌱 Environment/Energy query detected. Appending environmental site-restrictions...');
    finalQuery = `${finalQuery} (site:epa.gov OR site:eia.gov OR site:usgs.gov OR site:climate.gov OR site:nrel.gov)`;
  } else if (localClass.isLocal) {
    console.log('📍 Local Services/Dining query detected. Appending local site-restrictions...');
    finalQuery = `${finalQuery} (site:yelp.com OR site:tripadvisor.com OR site:opentable.com OR site:foursquare.com OR site:yellowpages.com)`;
  } else if (educationClass.isEducation) {
    console.log('📚 Education/Parenting query detected. Appending educational site-restrictions...');
    finalQuery = `${finalQuery} (site:khanacademy.org OR site:coursera.org OR site:edx.org OR site:niche.com OR site:greatschools.org)`;
  } else if (diyClass.isDIY) {
    console.log('🛠️ DIY/Gardening query detected. Appending DIY site-restrictions...');
    finalQuery = `${finalQuery} (site:homedepot.com OR site:lowes.com OR site:almanac.com OR site:instructables.com OR site:houzz.com)`;
  } else if (spaceAviationClass.isSpaceAviation) {
    console.log('🚀 Space/Aviation query detected. Appending airspace/space launch site-restrictions...');
    finalQuery = `${finalQuery} (site:aviationstack.com OR site:nasa.gov OR site:spacex.com OR site:flightradar24.com OR site:faa.gov)`;
  } else if (historyClass.isHistory) {
    console.log('📜 History/Genealogy query detected. Appending historical site-restrictions...');
    finalQuery = `${finalQuery} (site:archive.org OR site:archives.gov OR site:ancestry.com OR site:history.com OR site:loc.gov OR site:britannica.com)`;
  } else if (artDesignClass.isArtDesign) {
    console.log('🎨 Art/Design/Fashion query detected. Appending design site-restrictions...');
    finalQuery = `${finalQuery} (site:behance.net OR site:dribbble.com OR site:artstation.com OR site:archdaily.com OR site:vogue.com OR site:metmuseum.org OR site:moma.org)`;
  } else if (philosophyClass.isPhilosophy) {
    console.log('🧠 Philosophy/Religion query detected. Appending spiritual site-restrictions...');
    finalQuery = `${finalQuery} (site:plato.stanford.edu OR site:iep.utm.edu OR site:biblegateway.com OR site:quran.com OR site:sacred-texts.com)`;
  } else if (musicClass.isMusic) {
    console.log('🎵 Music/Audio query detected. Appending acoustics site-restrictions...');
    finalQuery = `${finalQuery} (site:genius.com OR site:ultimate-guitar.com OR site:soundonsound.com OR site:gearnews.com OR site:musicradar.com OR site:discogs.com)`;
  } else if (petsClass.isPets) {
    console.log('🐾 Pets/Animals query detected. Appending veterinary site-restrictions...');
    finalQuery = `${finalQuery} (site:akc.org OR site:catster.com OR site:petmd.com OR site:aspca.org OR site:avma.org)`;
  } else if (geopoliticsClass.isGeopolitics) {
    console.log('🗺️ Geopolitics/Defense query detected. Appending geopolitical site-restrictions...');
    finalQuery = `${finalQuery} (site:defense.gov OR site:militarytimes.com OR site:globalsecurity.org OR site:defensenews.com OR site:janes.com)`;
  } else if (architectureClass.isArchitecture) {
    console.log('🏗️ Architecture/Engineering query detected. Appending architecture site-restrictions...');
    finalQuery = `${finalQuery} (site:archdaily.com OR site:enr.com OR site:asce.org OR site:engineering.com OR site:iccsafe.org)`;
  } else if (agricultureClass.isAgriculture) {
    console.log('🌾 Agriculture/Agronomy query detected. Appending agricultural site-restrictions...');
    finalQuery = `${finalQuery} (site:usda.gov OR site:fao.org OR site:agweb.com OR site:modernfarmer.com OR site:agri-pulse.com)`;
  } else if (chemistryClass.isChemistry) {
    console.log('🧪 Chemistry/Materials Science query detected. Appending chemical site-restrictions...');
    finalQuery = `${finalQuery} (site:pubchem.ncbi.nlm.nih.gov OR site:chemspider.com OR site:commonchemistry.org OR site:sigmaaldrich.com OR site:rsc.org)`;
  } else if (hobbiesClass.isHobbies) {
    console.log('🎲 Hobbies/Collectibles query detected. Appending hobby site-restrictions...');
    finalQuery = `${finalQuery} (site:boardgamegeek.com OR site:dpreview.com OR site:tcgplayer.com OR site:psacard.com OR site:instructables.com)`;
  } else if (logisticsClass.isLogistics) {
    console.log('🚢 Maritime/Logistics query detected. Appending logistics site-restrictions...');
    finalQuery = `${finalQuery} (site:marinetraffic.com OR site:joc.com OR site:shippingwatch.com OR site:freightwaves.com OR site:portoflosangeles.org)`;
  } else if (personalFinanceClass.isPersonalFinance) {
    console.log('💵 Personal Finance/Taxation query detected. Appending personal finance site-restrictions...');
    finalQuery = `${finalQuery} (site:irs.gov OR site:nerdwallet.com OR site:investopedia.com OR site:creditkarma.com OR site:bankrate.com)`;
  } else if (cryptoClass.isCrypto) {
    console.log('🪙 Crypto/Blockchain query detected. Appending crypto site-restrictions...');
    finalQuery = `${finalQuery} (site:coinmarketcap.com OR site:coingecko.com OR site:etherscan.io OR site:coindesk.com OR site:cointelegraph.com OR site:decrypt.co)`;
  } else if (fitnessClass.isFitness) {
    console.log('💪 Fitness/Exercise query detected. Appending fitness site-restrictions...');
    finalQuery = `${finalQuery} (site:bodybuilding.com OR site:healthline.com OR site:muscleandfitness.com OR site:runnersworld.com OR site:crossfit.com OR site:verywellfit.com)`;
  } else if (psychologyClass.isPsychology) {
    console.log('🧠 Psychology/Cognitive Science query detected. Appending psychology site-restrictions...');
    finalQuery = `${finalQuery} (site:psychologytoday.com OR site:apa.org OR site:simplypsychology.org OR site:ncbi.nlm.nih.gov/pmc OR site:frontiersin.org OR site:sciencedirect.com)`;
  } else if (insuranceClass.isInsurance) {
    console.log('🛡️ Insurance/Risk Management query detected. Appending insurance site-restrictions...');
    finalQuery = `${finalQuery} (site:healthcare.gov OR site:progressive.com OR site:geico.com OR site:statefarm.com OR site:allstate.com OR site:naic.org OR site:iii.org)`;
  } else if (roboticsClass.isRobotics) {
    console.log('🤖 Manufacturing & Robotics query detected. Appending manufacturing site-restrictions...');
    finalQuery = `${finalQuery} (site:robotics.org OR site:machinedesign.com OR site:thomasnet.com OR site:controlglobal.com OR site:3dprinting.com OR site:automation.com)`;
  } else if (ticketingClass.isTicketing) {
    console.log('🎟️ Event Ticketing & Live Shows query detected. Appending ticketing site-restrictions...');
    finalQuery = `${finalQuery} (site:ticketmaster.com OR site:stubhub.com OR site:seatgeek.com OR site:livenation.com OR site:broadway.com OR site:vividseats.com)`;
  } else if (astronomyClass.isAstronomy) {
    console.log('🌌 Astronomy & Astrophysics query detected. Appending astronomy site-restrictions...');
    finalQuery = `${finalQuery} (site:nasa.gov OR site:esa.int OR site:hubblesite.org OR site:stsci.edu OR site:space.com OR site:astronomy.com OR site:arxiv.org/archive/astro-ph)`;
  } else if (anthropologyClass.isAnthropology) {
    console.log('🏺 Anthropology & Archaeology query detected. Appending anthropology site-restrictions...');
    finalQuery = `${finalQuery} (site:archaeology.org OR site:nationalgeographic.com OR site:smithsonianmag.com OR site:nature.com OR site:worldhistory.org OR site:anthropology-news.org)`;
  } else if (linguisticsClass.isLinguistics) {
    console.log('🗣️ Linguistics & Etymology query detected. Appending linguistics site-restrictions...');
    finalQuery = `${finalQuery} (site:etymonline.com OR site:linguistlist.org OR site:wals.info OR site:ethnologue.com OR site:sil.org OR site:cambridge.org/core/journals/linguistics)`;
  } else if (pediatricsClass.isPediatrics) {
    console.log('👶 Pediatrics & Childcare query detected. Appending child-care site-restrictions...');
    finalQuery = `${finalQuery} (site:aap.org OR site:healthychildren.org OR site:cdc.gov/ncbddd/childdevelopment OR site:mayoclinic.org OR site:webmd.com/parenting OR site:whattoexpect.com)`;
  } else if (sustainabilityClass.isSustainability) {
    console.log('♻️ Renewable Energy & Sustainability query detected. Appending sustainability site-restrictions...');
    finalQuery = `${finalQuery} (site:nrel.gov OR site:iea.org OR site:irena.org OR site:seia.org OR site:energy.gov OR site:sustainability.com OR site:clean-energy.org)`;
  } else if (dropshippingClass.isDropshipping) {
    console.log('📦 Wholesale Sourcing & Dropshipping query detected. Appending dropshipping site-restrictions...');
    finalQuery = `${finalQuery} (site:alibaba.com OR site:shopify.com OR site:spocket.co OR site:salehoo.com OR site:worldwidebrands.com OR site:thomasnet.com)`;
  } else if (civilLawClass.isCivilLaw) {
    console.log('⚖️ Civil Law & Torts query detected. Appending civil law site-restrictions...');
    finalQuery = `${finalQuery} (site:courtlistener.com OR site:justia.com OR site:findlaw.com OR site:law.cornell.edu OR site:scotusblog.com OR site:nolo.com)`;
  } else if (pedagogyClass.isPedagogy) {
    console.log('🍎 Pedagogy & Instructional Design query detected. Appending pedagogy site-restrictions...');
    finalQuery = `${finalQuery} (site:edutopia.org OR site:ascd.org OR site:ed.gov OR site:instructionaldesign.org OR site:coursera.org OR site:facultyfocus.com)`;
  } else if (veterinaryClass.isVeterinary) {
    console.log('🐾 Veterinary Medicine & Pathology query detected. Appending veterinary site-restrictions...');
    finalQuery = `${finalQuery} (site:avma.org OR site:vin.com OR site:petmd.com OR site:merckvetmanual.com OR site:veterinarypartner.com OR site:aaha.org)`;
  } else if (meteorologyClass.isMeteorology) {
    console.log('⛈️ Meteorology & Synoptic Forecasting query detected. Appending meteorology site-restrictions...');
    finalQuery = `${finalQuery} (site:weather.gov OR site:noaa.gov OR site:spc.noaa.gov OR site:nhc.noaa.gov OR site:wmo.int OR site:ecmwf.int)`;
  } else if (urbanPlanningClass.isUrbanPlanning) {
    console.log('🗺️ Urban Planning & GIS query detected. Appending urban planning site-restrictions...');
    finalQuery = `${finalQuery} (site:planning.org OR site:esri.com OR site:hud.gov OR site:smartcitiesworld.net OR site:citylab.com OR site:urban.org)`;
  } else if (foodChemistryClass.isFoodChemistry) {
    console.log('🍳 Molecular Gastronomy & Food Chemistry query detected. Appending molecular gastronomy site-restrictions...');
    finalQuery = `${finalQuery} (site:foodscience.org OR site:ift.org OR site:seriouseats.com OR site:modernistcuisine.com OR site:scienceofcooking.com OR site:khymos.org)`;
  } else if (marineBiologyClass.isMarineBiology) {
    console.log('🐳 Marine Biology & Oceanography query detected. Appending marine biology site-restrictions...');
    finalQuery = `${finalQuery} (site:noaa.gov OR site:mbari.org OR site:whoi.edu OR site:marinebio.org OR site:sciencedirect.com OR site:nature.com)`;
  } else if (theoreticalPhysicsClass.isTheoreticalPhysics) {
    console.log('⚛️ Theoretical Physics & Quantum Mechanics query detected. Appending theoretical physics site-restrictions...');
    finalQuery = `${finalQuery} (site:arxiv.org OR site:cern.ch OR site:aps.org OR site:physicsworld.com OR site:nature.com OR site:quantum-journal.org)`;
  } else if (paleontologyClass.isPaleontology) {
    console.log('🦕 Paleontology & Evolutionary Biology query detected. Appending paleontology site-restrictions...');
    finalQuery = `${finalQuery} (site:paleosoc.org OR site:vertpaleo.org OR site:fossils-facts-and-finds.com OR site:nature.com OR site:ucmp.berkeley.edu OR site:amnh.org)`;
  } else if (biomedicalClass.isBiomedical) {
    console.log('🦾 Biomedical Engineering & Prosthetics query detected. Appending biomedical site-restrictions...');
    finalQuery = `${finalQuery} (site:embs.org OR site:bmes.org OR site:pubmed.ncbi.nlm.nih.gov OR site:nature.com OR site:sciencedirect.com OR site:asme.org)`;
  } else if (climatologyClass.isClimatology) {
    console.log('🌍 Climatology & Paleoclimatology query detected. Appending climatology site-restrictions...');
    finalQuery = `${finalQuery} (site:ipcc.ch OR site:ncdc.noaa.gov OR site:climate.nasa.gov OR site:wmo.int OR site:copernicus.eu OR site:nature.com)`;
  } else if (neurotechClass.isNeurotech) {
    console.log('🧠 Neurotechnology & BCI query detected. Appending neurotech site-restrictions...');
    finalQuery = `${finalQuery} (site:neurotechx.com OR site:frontiersin.org OR site:nature.com OR site:pubmed.ncbi.nlm.nih.gov OR site:ieee.org OR site:bci-info.org)`;
  } else if (astrobiologyClass.isAstrobiology) {
    console.log('🌌 Astrobiology & Planetary Habitability query detected. Appending astrobiology site-restrictions...');
    finalQuery = `${finalQuery} (site:nasa.gov OR site:astrobiology.nasa.gov OR site:nature.com OR site:liebertpub.com/ast OR site:planetary.org OR site:sciencedirect.com)`;
  } else if (nanotechClass.isNanotech) {
    console.log('🔬 Nanotechnology & Nanomaterials query detected. Appending nanotech site-restrictions...');
    finalQuery = `${finalQuery} (site:nano.gov OR site:nature.com/nano OR site:nanotechweb.org OR site:sciencedirect.com OR site:ieee.org OR site:acs.org)`;
  } else if (nuclearClass.isNuclear) {
    console.log('⚛️ Nuclear Engineering & Fusion Technology query detected. Appending nuclear engineering site-restrictions...');
    finalQuery = `${finalQuery} (site:iaea.org OR site:ans.org OR site:world-nuclear.org OR site:iter.org OR site:sciencedirect.com OR site:nature.com)`;
  } else if (geneticsClass.isGenetics) {
    console.log('🧬 Genetics & CRISPR Gene Editing query detected. Appending gene-editing site-restrictions...');
    finalQuery = `${finalQuery} (site:broadinstitute.org OR site:nature.com/nrg OR site:pubmed.ncbi.nlm.nih.gov OR site:crisprjournal.com OR site:sciencedirect.com OR site:cell.com)`;
  } else if (ventureCapitalClass.isVentureCapital) {
    console.log('💼 Venture Capital & Startup Finance query detected. Appending venture capital site-restrictions...');
    finalQuery = `${finalQuery} (site:nvca.org OR site:crunchbase.com OR site:pitchbook.com OR site:ycombinator.com OR site:sec.gov OR site:venturebeat.com)`;
  } else if (digitalHumanitiesClass.isDigitalHumanities) {
    console.log('📜 Digital Humanities & Cultural Heritage query detected. Appending digital humanities site-restrictions...');
    finalQuery = `${finalQuery} (site:dh.org OR site:digitalhumanities.org OR site:ach.org OR site:mith.umd.edu OR site:loc.gov OR site:ox.ac.uk/research/digital-humanities)`;
  } else if (virologyClass.isVirology) {
    console.log('🦠 Virology & Immunology query detected. Appending virology site-restrictions...');
    finalQuery = `${finalQuery} (site:nature.com/nri OR site:pubmed.ncbi.nlm.nih.gov OR site:virology.ws OR site:cell.com/immunity OR site:who.int OR site:cdc.gov)`;
  } else if (quantumComputingClass.isQuantumComputing) {
    console.log('💻 Quantum Computing & Information query detected. Appending quantum computing site-restrictions...');
    finalQuery = `${finalQuery} (site:arxiv.org/archive/quant-ph OR site:quantum-journal.org OR site:nature.com/npjqi OR site:ieee.org OR site:sciencedirect.com OR site:aps.org)`;
  } else if (metallurgyClass.isMetallurgy) {
    console.log('🔬 Materials Science & Metallurgy query detected. Appending materials science site-restrictions...');
    finalQuery = `${finalQuery} (site:materialsscience.org OR site:nature.com/nmat OR site:sciencedirect.com OR site:metallurgy.org OR site:springer.com OR site:asminternational.org)`;
  } else if (organicChemistryClass.isOrganicChemistry) {
    console.log('🧪 Organic Chemistry & Drug Synthesis query detected. Appending organic chemistry site-restrictions...');
    finalQuery = `${finalQuery} (site:acs.org OR site:rsc.org OR site:sciencedirect.com OR site:nature.com/nchem OR site:chemspider.com OR site:organic-chemistry.org)`;
  } else if (gridInfrastructureClass.isGridInfrastructure) {
    console.log('⚡ Renewable Grid Infrastructure query detected. Appending grid infrastructure site-restrictions...');
    finalQuery = `${finalQuery} (site:ieee.org OR site:energy.gov OR site:epri.com OR site:nrel.gov OR site:cigre.org OR site:sciencedirect.com)`;
  } else if (mlopsClass.isMLOps) {
    console.log('🤖 MLOps query detected. Appending MLOps site-restrictions...');
    finalQuery = `${finalQuery} (site:mlops.community OR site:arxiv.org OR site:medium.com/tag/mlops OR site:github.com OR site:kubernetes.io OR site:huggingface.co)`;
  } else if (fluidDynamicsClass.isFluidDynamics) {
    console.log('✈️ Computational Fluid Dynamics query detected. Appending CFD site-restrictions...');
    finalQuery = `${finalQuery} (site:cfd-online.com OR site:nasa.gov OR site:arxiv.org/archive/physics.flu-dyn OR site:sciencedirect.com OR site:journals.aps.org/prfluids OR site:ieee.org)`;
  } else if (endocrinologyClass.isEndocrinology) {
    console.log('🩸 Endocrinology query detected. Appending endocrinology site-restrictions...');
    finalQuery = `${finalQuery} (site:endocrine.org OR site:ncbi.nlm.nih.gov/pmc OR site:nature.com/nrendo OR site:who.int OR site:pubmed.ncbi.nlm.nih.gov OR site:diabetesjournals.org)`;
  } else if (cryptographyClass.isCryptography) {
    console.log('🔐 Cryptography query detected. Appending cryptography site-restrictions...');
    finalQuery = `${finalQuery} (site:iacr.org OR site:arxiv.org/archive/cs.cr OR site:nist.gov OR site:crypto.stackexchange.com OR site:github.com OR site:schneier.com)`;
  } else if (behavioralEconomicsClass.isBehavioralEconomics) {
    console.log('📈 Behavioral Economics query detected. Appending behavioral economics site-restrictions...');
    finalQuery = `${finalQuery} (site:nber.org OR site:nobelprize.org OR site:sciencedirect.com OR site:aeaweb.org OR site:behavioraleconomics.com OR site:nature.com/nature-human-behaviour)`;
  } else if (seismologyClass.isSeismology) {
    console.log('🌋 Seismology & Volcanology query detected. Appending seismology site-restrictions...');
    finalQuery = `${finalQuery} (site:usgs.gov OR site:iris.edu OR site:volcano.si.edu OR site:sciencedirect.com OR site:nature.com/ngeo OR site:agu.org)`;
  } else if (compilerDesignClass.isCompilerDesign) {
    console.log('💻 Compiler Design & PLT query detected. Appending compiler design site-restrictions...');
    finalQuery = `${finalQuery} (site:llvm.org OR site:arxiv.org/archive/cs.PL OR site:github.com OR site:gcc.gnu.org OR site:sigplan.org OR site:dspace.mit.edu)`;
  }

  let videoReferences = [];
  let videoCitations = [];

  if (isVideoQuery) {
    console.log('📹 Detected video query. Performing YouTube search...');
    try {
      const videoCount = await extractVideoCount(query, conversationHistory);
      const videos = await searchYouTube(query, videoCount, conversationHistory);
      
      if (videos && videos.length > 0) {
        console.log(`Found ${videos.length} videos from YouTube`);
        
        const videoResultsBlock = `
[SYSTEM INSTRUCTION - ACTIVE ELITE YOUTUBE SEARCH]
YouTube Video Search Results:
${videos.map((vid, idx) => `
Video #${idx + 1}:
- Title: ${vid.title}
- Channel: ${vid.channelTitle}
- URL: ${vid.url}
- Description: ${vid.description}
- Published At: ${vid.publishedAt}
`).join('\n')}

INSTRUCTIONS FOR ULTIMATE SPEED & CITATION ACCURACY:
- Output a direct, simple, and straightforward response recommending/summarizing these videos.
- Never include conversational preambles ("Here are the videos...", "According to YouTube...").
- Highlight key videos with their titles in bold.
- Explicitly include source citation at the very top: "[Source: YouTube Search Service]".
- Format with neat bullet points, displaying the video title, channel, description, and direct link.
- Strictly stick to the provided YouTube video data.
`;
        
        finalQuery = `${videoResultsBlock}\n\nUser Request: ${query}`;
        
        videoReferences = videos.map((vid) => ({
          url: vid.url,
          domain: 'youtube.com',
          title: vid.title,
        }));
        
        videoCitations = videos.map((vid, index) => ({
          index: index + 1,
          url: vid.url,
          domain: 'youtube.com',
          title: vid.title,
        }));
      }
    } catch (err) {
      console.error('Error during YouTube search integration:', err);
    }
  }

  // 3. Check for GCP repository references from our local 1,388 catalog
  let gcpCatalogReferences = [];
  let gcpResultsBlock = '';
  const gcpKeywords = ['gcp', 'google cloud', 'submodule', 'import', 'google repository', 'google repo', 'appengine', 'cloud storage', 'compute engine', 'bigquery', 'cloud run', 'kubernetes', 'gke', 'terraform'];
  const isGcpRelated = gcpKeywords.some(keyword => query.toLowerCase().includes(keyword));

  if (isGcpRelated) {
    console.log('☁️ Query is GCP-related. Searching local GCP 1,388 open source catalog...');
    try {
      const searchResult = await GcpNativeService.searchGcpCatalog(query, { limit: 5 });
      if (searchResult.success && searchResult.results.length > 0) {
        console.log(`Found ${searchResult.results.length} matching GCP repositories from catalog!`);
        gcpCatalogReferences = searchResult.results.map(repo => ({
          url: repo.html_url,
          domain: repo.domain || (repo.org === 'google' ? 'github.com/google' : 'github.com/GoogleCloudPlatform'),
          title: `${repo.name} (${repo.language}) - ${repo.license} License`,
          clone_url: repo.clone_url,
          stars: repo.stars,
          forks: repo.forks,
          description: repo.description
        }));

        gcpResultsBlock = `
[SYSTEM INSTRUCTION - ACTIVE ELIVE GOOGLE OPEN SOURCE CATALOG RETRIEVAL]
The following 100% verified, production-grade repositories were found in our pre-compiled Google & Google Cloud open-source catalog. These are officially licensed under MIT/Apache-2.0:

${searchResult.results.map((repo, idx) => `
Repository #${idx + 1}:
- Name: ${repo.name}
- Organization: ${repo.org || 'GoogleCloudPlatform'}
- Language: ${repo.language}
- Stars: ${repo.stars} | Forks: ${repo.forks}
- License: ${repo.license}
- GitHub URL: ${repo.html_url}
- Clone Command: git clone ${repo.clone_url}
- Description: ${repo.description || 'No description provided.'}
`).join('\n')}

INSTRUCTIONS FOR HARNESSING THESE BLUEPRINTS:
1. Synthesize your architectural and setup advice by drawing directly from these verified repositories.
2. Under your response, present these repositories as beautiful reference links or code blocks for the user.
3. Make sure to highlight that these are fully compliant open-source blueprints from Google and Google Cloud.
4. Keep the answer highly truthful, exact, and grounded in these repositories.
`;
        
        finalQuery = `${gcpResultsBlock}\n\n${finalQuery}`;
      }
    } catch (err) {
      console.error('Error querying GCP catalog in grounding service:', err);
    }
  }

  const MAX_RETRIES = 3;
  let attemptCount = 0;

  while (attemptCount < MAX_RETRIES) {
    attemptCount++;

    try {
      const startTime = Date.now();

      // Token management: Check if history needs semantic compression
      const TOKEN_LIMIT = 6000;
      const QUERY_TOKEN_RESERVE = 2000;
      const MAX_HISTORY_TOKENS = TOKEN_LIMIT - QUERY_TOKEN_RESERVE;

      let processedHistory = conversationHistory;
      const historyTokens = await estimateTokens(conversationHistory);

      console.log(
        `📊 History tokens: ${historyTokens} / ${MAX_HISTORY_TOKENS}`
      );

      if (historyTokens > MAX_HISTORY_TOKENS) {
        console.log(
          `⚠️ History exceeds token limit (${historyTokens} > ${MAX_HISTORY_TOKENS}), compressing semantically...`
        );
        processedHistory = await compressHistorySemantically(conversationHistory, ai);

        // Check if even summary is too large
        const summaryTokens = estimateTokens(processedHistory);
        if (summaryTokens > MAX_HISTORY_TOKENS) {
          console.log(
            `⚠️ Summary still too large, truncating to last message only`
          );
          processedHistory = conversationHistory.slice(-1);
        }
      }

      // Build contents with proper format for Google GenAI
      const contents = [
        ...processedHistory.map((msg) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        })),
        {
          role: 'user',
          parts: [{ text: finalQuery }],
        },
      ];
      console.log(`📄 Total messages sent: ${JSON.stringify(contents)}`);

      const result = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: contents,
        config: {
          temperature: 0.2,
          maxOutputTokens: 4000,
          systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
        },
      });

      const endTime = Date.now();
      console.log(`⏱️ Search took ${endTime - startTime} ms`);
      const response = result.candidates[0];

      // Check if finishReason is STOP but no content (empty or incomplete response)
      let hasContent = false;

      if (response.content?.parts && response.content.parts.length > 0) {
        // Check if we have meaningful text content
        const textParts = response.content.parts
          .filter((part) => part.text && !part.thought)
          .map((part) => part.text.trim());

        const fullText = textParts.join('').trim();

        // Consider response valid if:
        // 1. Text has meaningful length (> 10 chars)
        // 2. Text is not just incomplete JSON structure
        // 3. Text doesn't look like a partial response
        const isIncompleteJson =
          /^{\s*"?\s*$/.test(fullText) ||
          fullText === '{' ||
          fullText === '{\n';
        const isMeaningful = fullText.length > 2 && !isIncompleteJson;

        hasContent = isMeaningful;

        if (!hasContent) {
          console.warn(
            `⚠️ Detected incomplete/meaningless response: "${fullText.substring(0, 50)}..."`
          );
        }
      }

      if (response.finishReason === 'STOP' && !hasContent) {
        console.warn(
          `⚠️ Attempt ${attemptCount}/${MAX_RETRIES}: Got STOP but no valid content. Retrying...`
        );
        console.log(
          'Empty/incomplete response details:',
          JSON.stringify(result, null, 2)
        );

        if (attemptCount < MAX_RETRIES) {
          // Wait before retry (exponential backoff)
          const waitTime = Math.pow(2, attemptCount) * 1000; // 2s, 4s, 8s
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue; // Retry
        } else {
          console.error(
            `❌ All ${MAX_RETRIES} attempts failed with empty/incomplete responses`
          );
          throw new Error(
            'Model returned STOP but no valid content after 3 attempts'
          );
        }
      }

      console.log('Full response object:', JSON.stringify(result, null, 2));
      console.log(
        'Response content:',
        JSON.stringify(response.content, null, 2)
      );
      console.log('Response parts:', response.content?.parts);

      // Log thinking process if available
      if (response.content?.parts) {
        response.content.parts.forEach((part, index) => {
          if (part.thought) {
            console.log(`\n🧠 === GEMINI THINKING (Part ${index + 1}) ===`);
            console.log(part.thought);
            console.log(`=== END THINKING ===\n`);
          }
        });
      }

      // Extract only the text parts (not thinking)
      const text = response.content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');

      // Stitch and deduplicate references and citations using our new engine
      const extraReferences = [
        ...(videoReferences || []),
        ...(gcpCatalogReferences || [])
      ];
      const { references: mergedReferences, citations: mergedCitations } = 
        UnifiedSmartRouter.stitchAndDeduplicateCitations(registryMetadata, groundingMetadata, extraReferences);

      // Build citation metadata
      const citationMetadata = groundingMetadata
        ? {
            searchQueries: groundingMetadata.webSearchQueries || [],
            searchTimestamp: new Date().toISOString(),
            model: 'gemini-3.5-flash',
            groundingSupports: groundingMetadata.groundingSupports?.length || 0,
            totalSources: groundingMetadata.groundingChunks?.length || 0,
            searchMethod: isVideoQuery ? 'youtube_search' : isFinancialQuery ? 'massive_realtime' : 'native_grounding',
          }
        : {
            searchTimestamp: new Date().toISOString(),
            searchMethod: isVideoQuery ? 'youtube_search' : isFinancialQuery ? 'massive_realtime' : 'native_grounding',
          };

      console.log(`✅ Grounded search completed on attempt ${attemptCount}`);
      console.log(
        `📊 Used ${groundingMetadata?.webSearchQueries?.length || 0} search queries`
      );
      console.log(`📚 Found ${references.length} sources`);

      if (groundingMetadata?.webSearchQueries) {
        console.log(
          `🔎 Search queries used:`,
          groundingMetadata.webSearchQueries
        );
      }

      return {
        answer: text,
        reference: mergedReferences,
        citations: mergedCitations,
        citationMetadata: citationMetadata,
        registryMetadata: registryMetadata,
      };
    } catch (error) {
      console.error(
        `❌ Error in grounded search (attempt ${attemptCount}/${MAX_RETRIES}):`,
        error
      );

      // If we've exhausted retries, throw the error
      if (attemptCount >= MAX_RETRIES) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      const waitTime = Math.pow(2, attemptCount) * 1000;
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  // Should never reach here, but just in case
  throw new Error(
    'Unexpected: Exhausted all retry attempts without returning or throwing'
  );
}

/**
 * Execute grounded search with specific model
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages
 * @param {string} modelName - Specific model to use
 * @returns {Object} Formatted response
 */
export async function executeGroundedSearchWithModel(
  query,
  conversationHistory = [],
  modelName = 'gemini-3.5-flash'
) {
  console.log(`🔍 Executing grounded search with ${modelName}: "${query}"`);

  // Inject Massive.com real-time financial data before sending to Gemini
  const enhancedQuery = await massiveSmartRouter.routeAndEnhancePrompt(query);
  const isFinancialQuery = enhancedQuery !== query;
  if (isFinancialQuery) {
    console.log(`💹 [executeGroundedSearchWithModel] Massive financial data injected for: "${query.substring(0, 60)}..."`);
  }

  // Build contents with proper format for Google GenAI
  const contents = [
    ...conversationHistory.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    })),
    {
      role: 'user',
      parts: [{ text: enhancedQuery }],
    },
  ];

  try {
    const result = await ai.models.generateContent({
      model: modelName,
      contents: contents,
      config: {
        temperature: 0.2,
        maxOutputTokens: 4000,
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} }],
      },
    });

    const response = result.candidates?.[0];
    if (!response) {
      throw new Error('No candidate returned from Gemini model');
    }
    const text = response.content?.parts
      ?.filter((part) => part.text)
      ?.map((part) => part.text)
      ?.join('') || '';

    const groundingMetadata = response.groundingMetadata;

    const references = [];
    const usedUrls = new Set();

    if (groundingMetadata?.groundingChunks) {
      groundingMetadata.groundingChunks.forEach((chunk) => {
        if (chunk.web?.uri && !usedUrls.has(chunk.web.uri)) {
          usedUrls.add(chunk.web.uri);

          try {
            const url = new URL(chunk.web.uri);
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || url.hostname.replace('www.', ''),
              title: chunk.web.title,
            });
          } catch {
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || 'unknown',
              title: chunk.web.title,
            });
          }
        }
      });
    }

    const limitedReferences = references.slice(0, 5);

    const citations = limitedReferences.map((ref, index) => ({
      index: index + 1,
      url: ref.url,
      domain: ref.domain,
      title: ref.title,
    }));

    const citationMetadata = groundingMetadata
      ? {
          searchQueries: groundingMetadata.webSearchQueries || [],
          searchTimestamp: new Date().toISOString(),
          model: modelName,
          groundingSupports: groundingMetadata.groundingSupports?.length || 0,
          totalSources: groundingMetadata.groundingChunks?.length || 0,
        }
      : null;

    console.log(`✅ Grounded search completed with ${modelName}`);
    console.log(
      `📊 Used ${groundingMetadata?.webSearchQueries?.length || 0} search queries`
    );
    console.log(`📚 Found ${references.length} sources`);

    return {
      answer: text,
      reference: limitedReferences,
      citations: citations,
      citationMetadata: citationMetadata,
    };
  } catch (error) {
    console.error(`❌ Error in grounded search with ${modelName}:`, error);
    throw error;
  }
}

export default {
  createGroundedModel,
  executeGroundedSearch,
  executeGroundedSearchStream,
  executeGroundedSearchWithModel,
};
