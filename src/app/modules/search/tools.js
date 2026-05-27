import { DynamicStructuredTool, StructuredTool } from '@langchain/core/tools';
import { GoogleCustomSearch } from '@langchain/community/tools/google_custom_search';
import { z } from 'zod';
import config from '../../../../config/index.js';
import { getNewsApiAiData } from '../../helpers/v13DataIntegrations.js';
import { getGreenlightIntelligenceData } from '../../helpers/v14DataIntegrations.js';
import { getPremiumIntelligenceData } from '../../helpers/v15DataIntegrations.js';
import { getPremiumV16IntelligenceData } from '../../helpers/v16DataIntegrations.js';
import { getPremiumV17IntelligenceData } from '../../helpers/v17DataIntegrations.js';
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
} from './services/queryClassifier.js';

const rawGoogle = new GoogleCustomSearch({
  maxResults: 20, // Default max results
  apiKey: config.google_search_api_key,
  googleCSEId: config.google_engine_id,
});

// Structured wrapper so the LLM won’t pass [object Object]
export const googleSearch = new DynamicStructuredTool({
  name: 'google_search',
  description: `
      Advanced web search tool with intelligent sports query enhancement. Use this tool when you need current, real-time information, news, facts, or data that requires web search. 
  
  WHEN TO USE:
  - Current events, news, or time-sensitive information
  - Recent data, prices, or statistics  
  - Specific facts that may have changed recently
  - Information about ongoing events or developments
  - Sports scores, schedules, or recent games (automatically enhanced with site restrictions)
  - Weather, stock prices, or real-time data
  
  SPORTS INTELLIGENCE:
  - Automatically detects sports-related queries
  - For sports queries, restricts search to authoritative sources: ESPN, NHL.com, www.viagogo.com, MLB.com, NFL.com, NBA.com, and official team sites
  - Adds current season context (e.g., "2025-2026 season" for NHL)
  - Includes "after current date" for schedule queries
  - Example: "Detroit Red Wings home game" becomes "Detroit Red Wings home game 2025-2026 season after 2025-10-12 (site:espn.com OR site:nhl.com OR site:detroitredwings.com)"
  
  SEARCH STRATEGIES:
  - Use specific, focused queries for better results
  - Include time context (e.g., "2025", "recent", "latest") for current information
  - Combine multiple concepts in one search when relevant
  - Use quotation marks for exact phrases when needed
  - Sports queries are automatically optimized with site restrictions and date context
  - Search top 20 results for best info
  
  The tool automatically updates queries with current date context for time-sensitive searches.
    `,
  schema: z.object({
    query: z
      .string()
      .describe("Plain-text search query, e.g., 'next SpaceX launch schedule'"),
    dateRestrict: z
      .string()
      .optional()
      .describe("Google dateRestrict like 'd7' (7 days), 'w1' (1 week), etc."),
    tz: z.string().describe("IANA timezone, e.g., 'Asia/Dhaka'"),
    gl: z.string().optional().describe("Geolocation region code, e.g., 'us'"),
    lr: z.string().optional().describe("Language restrict, e.g., 'lang_en'"),
    safe: z.string().optional().describe('safe, off, or active'),
    num: z
      .number()
      .min(1)
      .max(50)
      .default(20)
      .describe('Number of search results to return, 1–50'),
  }),
  func: async ({ query, ...params }) => {
    console.log('Params are', params);

    // Helper function to detect sports queries
    const isSportsQuery = (searchQuery) => {
      const sportsKeywords = [
        // Team names
        'detroit red wings',
        'detroit tigers',
        'detroit lions',
        'detroit pistons',
        'red wings',
        'tigers',
        'lions',
        'pistons',
        // General sports terms
        'game',
        'schedule',
        'season',
        'match',
        'playoff',
        'championship',
        'home game',
        'away game',
        'next game',
        'upcoming game',
        'regular season',
        'preseason',
        'postseason',
        // Sports types
        'hockey',
        'baseball',
        'football',
        'basketball',
        'soccer',
        'nhl',
        'mlb',
        'nfl',
        'nba',
        'mls',
        // Sport-specific terms
        'roster',
        'standings',
        'stats',
        'score',
        'result',
      ];

      const lowerQuery = searchQuery.toLowerCase();
      return sportsKeywords.some((keyword) => lowerQuery.includes(keyword));
    };

    // Helper function to enhance sports queries with site restrictions
    const enhanceSportsQuery = (originalQuery) => {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;
      const currentDay = currentDate.getDate();
      const dateString = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`;

      let enhancedQuery = originalQuery;

      // Add current season context
      if (!enhancedQuery.includes(currentYear.toString())) {
        if (
          enhancedQuery.toLowerCase().includes('red wings') ||
          enhancedQuery.toLowerCase().includes('hockey') ||
          enhancedQuery.toLowerCase().includes('nhl')
        ) {
          enhancedQuery += ` ${currentYear}-${currentYear + 1} season`;
        } else {
          enhancedQuery += ` ${currentYear}`;
        }
      }

      // Add "after current date" context for schedule queries
      if (/\b(next|upcoming|schedule|game|match)\b/i.test(enhancedQuery)) {
        enhancedQuery += ` after ${dateString}`;
      }

      // Add site restrictions for sports queries
      const sportsSites =
        'site:espn.com OR site:nhl.com OR www.viagogo.com OR site:mlb.com OR site:nfl.com OR site:nba.com OR site:detroitredwings.com OR site:detroittigers.com OR site:detroitlions.com OR site:detroitpistons.com';
      enhancedQuery += ` (${sportsSites})`;

      console.log(`🏒 Enhanced sports query: "${enhancedQuery}"`);
      return enhancedQuery;
    };

    // Check if this is a sports query and enhance it accordingly
    let finalQuery = query;
    if (isSportsQuery(query)) {
      console.log(`🎯 Sports query detected: "${query}"`);
      finalQuery = enhanceSportsQuery(query);
    } else {
      // Run backend topic classifiers for smart search grounding in tools
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

      if (academicClass.isAcademic) {
        console.log('🎓 Academic search query detected. Appending scientific site-restrictions...');
        finalQuery = `${finalQuery} (site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov OR site:scholar.google.com OR site:nature.com OR site:researchgate.net OR site:ieee.org)`;
      } else if (discussionClass.isDiscussion) {
        console.log('💬 Discussion search query detected. Appending community site-restrictions...');
        finalQuery = `${finalQuery} (site:reddit.com OR site:news.ycombinator.com OR site:quora.com OR site:producthunt.com)`;
      } else if (weatherClass.isWeather) {
        console.log('☀️ Weather search query detected. Appending meteorological site-restrictions...');
        finalQuery = `${finalQuery} (site:weather.gov OR site:noaa.gov OR site:accuweather.com OR site:weather.com)`;
      } else if (newsClass.isNews) {
        console.log('📰 News search query detected. Appending news freshness context...');
        finalQuery = `${finalQuery} news latest`;
      } else if (medicalClass.isMedical) {
        console.log('⚕️ Medical/Health search query detected. Appending health site-restrictions...');
        finalQuery = `${finalQuery} (site:nih.gov OR site:fda.gov OR site:who.int OR site:cdc.gov OR site:pubmed.ncbi.nlm.nih.gov)`;
      } else if (foodClass.isFood) {
        console.log('🍎 Food/Nutrition search query detected. Appending food data site-restrictions...');
        finalQuery = `${finalQuery} (site:usda.gov OR site:openfoodfacts.org OR site:fda.gov)`;
      } else if (legalClass.isLegal) {
        console.log('⚖️ Legal search query detected. Appending legal site-restrictions...');
        finalQuery = `${finalQuery} (site:courtlistener.com OR site:justia.com OR site:oyez.org OR site:findlaw.com)`;
      } else if (patentClass.isPatent) {
        console.log('💡 Patent search query detected. Appending patent site-restrictions...');
        finalQuery = `${finalQuery} (site:patents.google.com OR site:uspto.gov OR site:patentsview.org)`;
      } else if (securityClass.isSecurity) {
        console.log('🔒 Cybersecurity search query detected. Appending vulnerability site-restrictions...');
        finalQuery = `${finalQuery} (site:nvd.nist.gov OR site:cisa.gov OR site:cve.org OR site:mitre.org)`;
      } else if (govFinanceClass.isGovFinance) {
        console.log('🏛️ Gov Finance search query detected. Appending fiscal site-restrictions...');
        finalQuery = `${finalQuery} (site:fiscaldata.treasury.gov OR site:usaspending.gov OR site:sam.gov)`;
      } else if (realEstateClass.isRealEstate) {
        console.log('🏢 Real Estate search query detected. Appending building permit site-restrictions...');
        finalQuery = `${finalQuery} (site:census.gov OR site:zillow.com OR site:redfin.com)`;
      } else if (economicsClass.isEconomics) {
        console.log('📊 Macroeconomics search query detected. Appending economic data site-restrictions...');
        finalQuery = `${finalQuery} (site:worldbank.org OR site:imf.org OR site:oecd.org OR site:bls.gov OR site:bea.gov)`;
      } else if (biologyClass.isBiology) {
        console.log('🧬 Biology/Genomics search query detected. Appending scientific databases site-restrictions...');
        finalQuery = `${finalQuery} (site:uniprot.org OR site:ensembl.org OR site:ncbi.nlm.nih.gov OR site:rcsb.org OR site:gnomad.broadinstitute.org)`;
      } else if (entertainmentClass.isEntertainment) {
        console.log('🎬 Entertainment/Pop Culture search query detected. Appending showbusiness site-restrictions...');
        finalQuery = `${finalQuery} (site:imdb.com OR site:rottentomatoes.com OR site:spotify.com OR site:billboard.com OR site:metacritic.com)`;
      } else if (travelClass.isTravel) {
        console.log('✈️ Travel/Hospitality search query detected. Appending hospitality site-restrictions...');
        finalQuery = `${finalQuery} (site:tripadvisor.com OR site:booking.com OR site:expedia.com OR site:airbnb.com OR site:lonelyplanet.com)`;
      } else if (shoppingClass.isShopping) {
        console.log('🛍️ Product Shopping search query detected. Appending e-commerce site-restrictions...');
        finalQuery = `${finalQuery} (site:amazon.com OR site:bestbuy.com OR site:ebay.com OR site:target.com OR site:walmart.com)`;
      } else if (careerClass.isCareer) {
        console.log('💼 Job/Career search query detected. Appending job portal site-restrictions...');
        finalQuery = `${finalQuery} (site:linkedin.com OR site:indeed.com OR site:glassdoor.com OR site:ziprecruiter.com OR site:salary.com)`;
      } else if (automotiveClass.isAutomotive) {
        console.log('🚗 Automotive/Vehicle search query detected. Appending automotive specs site-restrictions...');
        finalQuery = `${finalQuery} (site:kbb.com OR site:edmunds.com OR site:caranddriver.com OR site:carfax.com OR site:motortrend.com)`;
      } else if (gamingClass.isGaming) {
        console.log('🎮 Gaming/Esports search query detected. Appending gaming site-restrictions...');
        finalQuery = `${finalQuery} (site:ign.com OR site:gamespot.com OR site:twitch.tv OR site:steampowered.com OR site:liquipedia.net)`;
      } else if (environmentClass.isEnvironment) {
        console.log('🌱 Environment/Energy search query detected. Appending environmental site-restrictions...');
        finalQuery = `${finalQuery} (site:epa.gov OR site:eia.gov OR site:usgs.gov OR site:climate.gov OR site:nrel.gov)`;
      } else if (localClass.isLocal) {
        console.log('📍 Local Services/Dining search query detected. Appending local site-restrictions...');
        finalQuery = `${finalQuery} (site:yelp.com OR site:tripadvisor.com OR site:opentable.com OR site:foursquare.com OR site:yellowpages.com)`;
      } else if (educationClass.isEducation) {
        console.log('📚 Education/Parenting search query detected. Appending educational site-restrictions...');
        finalQuery = `${finalQuery} (site:khanacademy.org OR site:coursera.org OR site:edx.org OR site:niche.com OR site:greatschools.org)`;
      } else if (diyClass.isDIY) {
        console.log('🛠️ DIY/Gardening search query detected. Appending DIY site-restrictions...');
        finalQuery = `${finalQuery} (site:homedepot.com OR site:lowes.com OR site:almanac.com OR site:instructables.com OR site:houzz.com)`;
      } else if (spaceAviationClass.isSpaceAviation) {
        console.log('🚀 Space/Aviation search query detected. Appending airspace/space launch site-restrictions...');
        finalQuery = `${finalQuery} (site:aviationstack.com OR site:nasa.gov OR site:spacex.com OR site:flightradar24.com OR site:faa.gov)`;
      } else if (historyClass.isHistory) {
        console.log('📜 History/Genealogy search query detected. Appending historical site-restrictions...');
        finalQuery = `${finalQuery} (site:archive.org OR site:archives.gov OR site:ancestry.com OR site:history.com OR site:loc.gov OR site:britannica.com)`;
      } else if (artDesignClass.isArtDesign) {
        console.log('🎨 Art/Design/Fashion search query detected. Appending design site-restrictions...');
        finalQuery = `${finalQuery} (site:behance.net OR site:dribbble.com OR site:artstation.com OR site:archdaily.com OR site:vogue.com OR site:metmuseum.org OR site:moma.org)`;
      } else if (philosophyClass.isPhilosophy) {
        console.log('🧠 Philosophy/Religion search query detected. Appending spiritual site-restrictions...');
        finalQuery = `${finalQuery} (site:plato.stanford.edu OR site:iep.utm.edu OR site:biblegateway.com OR site:quran.com OR site:sacred-texts.com)`;
      } else if (musicClass.isMusic) {
        console.log('🎵 Music/Audio search query detected. Appending acoustics site-restrictions...');
        finalQuery = `${finalQuery} (site:genius.com OR site:ultimate-guitar.com OR site:soundonsound.com OR site:gearnews.com OR site:musicradar.com OR site:discogs.com)`;
      } else if (petsClass.isPets) {
        console.log('🐾 Pets/Animals search query detected. Appending veterinary site-restrictions...');
        finalQuery = `${finalQuery} (site:akc.org OR site:catster.com OR site:petmd.com OR site:aspca.org OR site:avma.org)`;
      } else if (geopoliticsClass.isGeopolitics) {
        console.log('🗺️ Geopolitics/Defense search query detected. Appending geopolitical site-restrictions...');
        finalQuery = `${finalQuery} (site:defense.gov OR site:militarytimes.com OR site:globalsecurity.org OR site:defensenews.com OR site:janes.com)`;
      } else if (architectureClass.isArchitecture) {
        console.log('🏗️ Architecture/Engineering search query detected. Appending architecture site-restrictions...');
        finalQuery = `${finalQuery} (site:archdaily.com OR site:enr.com OR site:asce.org OR site:engineering.com OR site:iccsafe.org)`;
      } else if (agricultureClass.isAgriculture) {
        console.log('🌾 Agriculture/Agronomy search query detected. Appending agricultural site-restrictions...');
        finalQuery = `${finalQuery} (site:usda.gov OR site:fao.org OR site:agweb.com OR site:modernfarmer.com OR site:agri-pulse.com)`;
      } else if (chemistryClass.isChemistry) {
        console.log('🧪 Chemistry/Materials Science search query detected. Appending chemical site-restrictions...');
        finalQuery = `${finalQuery} (site:pubchem.ncbi.nlm.nih.gov OR site:chemspider.com OR site:commonchemistry.org OR site:sigmaaldrich.com OR site:rsc.org)`;
      } else if (hobbiesClass.isHobbies) {
        console.log('🎲 Hobbies/Collectibles search query detected. Appending hobby site-restrictions...');
        finalQuery = `${finalQuery} (site:boardgamegeek.com OR site:dpreview.com OR site:tcgplayer.com OR site:psacard.com OR site:instructables.com)`;
      } else if (logisticsClass.isLogistics) {
        console.log('🚢 Maritime/Logistics search query detected. Appending logistics site-restrictions...');
        finalQuery = `${finalQuery} (site:marinetraffic.com OR site:joc.com OR site:shippingwatch.com OR site:freightwaves.com OR site:portoflosangeles.org)`;
      } else if (personalFinanceClass.isPersonalFinance) {
        console.log('💵 Personal Finance/Taxation search query detected. Appending personal finance site-restrictions...');
        finalQuery = `${finalQuery} (site:irs.gov OR site:nerdwallet.com OR site:investopedia.com OR site:creditkarma.com OR site:bankrate.com)`;
      } else if (cryptoClass.isCrypto) {
        console.log('🪙 Crypto/Blockchain search query detected. Appending crypto site-restrictions...');
        finalQuery = `${finalQuery} (site:coinmarketcap.com OR site:coingecko.com OR site:etherscan.io OR site:coindesk.com OR site:cointelegraph.com OR site:decrypt.co)`;
      } else if (fitnessClass.isFitness) {
        console.log('💪 Fitness/Exercise search query detected. Appending fitness site-restrictions...');
        finalQuery = `${finalQuery} (site:bodybuilding.com OR site:healthline.com OR site:muscleandfitness.com OR site:runnersworld.com OR site:crossfit.com OR site:verywellfit.com)`;
      } else if (psychologyClass.isPsychology) {
        console.log('🧠 Psychology/Cognitive Science search query detected. Appending psychology site-restrictions...');
        finalQuery = `${finalQuery} (site:psychologytoday.com OR site:apa.org OR site:simplypsychology.org OR site:ncbi.nlm.nih.gov/pmc OR site:frontiersin.org OR site:sciencedirect.com)`;
      } else if (insuranceClass.isInsurance) {
        console.log('🛡️ Insurance/Risk Management search query detected. Appending insurance site-restrictions...');
        finalQuery = `${finalQuery} (site:healthcare.gov OR site:progressive.com OR site:geico.com OR site:statefarm.com OR site:allstate.com OR site:naic.org OR site:iii.org)`;
      } else if (roboticsClass.isRobotics) {
        console.log('🤖 Manufacturing & Robotics search query detected. Appending manufacturing site-restrictions...');
        finalQuery = `${finalQuery} (site:robotics.org OR site:machinedesign.com OR site:thomasnet.com OR site:controlglobal.com OR site:3dprinting.com OR site:automation.com)`;
      } else if (ticketingClass.isTicketing) {
        console.log('🎟️ Event Ticketing & Live Shows search query detected. Appending ticketing site-restrictions...');
        finalQuery = `${finalQuery} (site:ticketmaster.com OR site:stubhub.com OR site:seatgeek.com OR site:livenation.com OR site:broadway.com OR site:vividseats.com)`;
      } else if (astronomyClass.isAstronomy) {
        console.log('🌌 Astronomy & Astrophysics search query detected. Appending astronomy site-restrictions...');
        finalQuery = `${finalQuery} (site:nasa.gov OR site:esa.int OR site:hubblesite.org OR site:stsci.edu OR site:space.com OR site:astronomy.com OR site:arxiv.org/archive/astro-ph)`;
      } else if (anthropologyClass.isAnthropology) {
        console.log('🏺 Anthropology & Archaeology search query detected. Appending anthropology site-restrictions...');
        finalQuery = `${finalQuery} (site:archaeology.org OR site:nationalgeographic.com OR site:smithsonianmag.com OR site:nature.com OR site:worldhistory.org OR site:anthropology-news.org)`;
      } else if (linguisticsClass.isLinguistics) {
        console.log('🗣️ Linguistics & Etymology search query detected. Appending linguistics site-restrictions...');
        finalQuery = `${finalQuery} (site:etymonline.com OR site:linguistlist.org OR site:wals.info OR site:ethnologue.com OR site:sil.org OR site:cambridge.org/core/journals/linguistics)`;
      } else if (pediatricsClass.isPediatrics) {
        console.log('👶 Pediatrics & Childcare search query detected. Appending child-care site-restrictions...');
        finalQuery = `${finalQuery} (site:aap.org OR site:healthychildren.org OR site:cdc.gov/ncbddd/childdevelopment OR site:mayoclinic.org OR site:webmd.com/parenting OR site:whattoexpect.com)`;
      } else if (sustainabilityClass.isSustainability) {
        console.log('♻️ Renewable Energy & Sustainability search query detected. Appending sustainability site-restrictions...');
        finalQuery = `${finalQuery} (site:nrel.gov OR site:iea.org OR site:irena.org OR site:seia.org OR site:energy.gov OR site:sustainability.com OR site:clean-energy.org)`;
      } else if (dropshippingClass.isDropshipping) {
        console.log('📦 Wholesale Sourcing & Dropshipping search query detected. Appending dropshipping site-restrictions...');
        finalQuery = `${finalQuery} (site:alibaba.com OR site:shopify.com OR site:spocket.co OR site:salehoo.com OR site:worldwidebrands.com OR site:thomasnet.com)`;
      } else if (civilLawClass.isCivilLaw) {
        console.log('⚖️ Civil Law & Torts search query detected. Appending civil law site-restrictions...');
        finalQuery = `${finalQuery} (site:courtlistener.com OR site:justia.com OR site:findlaw.com OR site:law.cornell.edu OR site:scotusblog.com OR site:nolo.com)`;
      } else if (pedagogyClass.isPedagogy) {
        console.log('🍎 Pedagogy & Instructional Design search query detected. Appending pedagogy site-restrictions...');
        finalQuery = `${finalQuery} (site:edutopia.org OR site:ascd.org OR site:ed.gov OR site:instructionaldesign.org OR site:coursera.org OR site:facultyfocus.com)`;
      } else if (veterinaryClass.isVeterinary) {
        console.log('🐾 Veterinary Medicine & Pathology search query detected. Appending veterinary site-restrictions...');
        finalQuery = `${finalQuery} (site:avma.org OR site:vin.com OR site:petmd.com OR site:merckvetmanual.com OR site:veterinarypartner.com OR site:aaha.org)`;
      } else if (meteorologyClass.isMeteorology) {
        console.log('⛈️ Meteorology & Synoptic Forecasting search query detected. Appending meteorology site-restrictions...');
        finalQuery = `${finalQuery} (site:weather.gov OR site:noaa.gov OR site:spc.noaa.gov OR site:nhc.noaa.gov OR site:wmo.int OR site:ecmwf.int)`;
      } else if (urbanPlanningClass.isUrbanPlanning) {
        console.log('🗺️ Urban Planning & GIS search query detected. Appending urban planning site-restrictions...');
        finalQuery = `${finalQuery} (site:planning.org OR site:esri.com OR site:hud.gov OR site:smartcitiesworld.net OR site:citylab.com OR site:urban.org)`;
      } else if (foodChemistryClass.isFoodChemistry) {
        console.log('🍳 Molecular Gastronomy & Food Chemistry search query detected. Appending molecular gastronomy site-restrictions...');
        finalQuery = `${finalQuery} (site:foodscience.org OR site:ift.org OR site:seriouseats.com OR site:modernistcuisine.com OR site:scienceofcooking.com OR site:khymos.org)`;
      } else if (marineBiologyClass.isMarineBiology) {
        console.log('🐳 Marine Biology & Oceanography search query detected. Appending marine biology site-restrictions...');
        finalQuery = `${finalQuery} (site:noaa.gov OR site:mbari.org OR site:whoi.edu OR site:marinebio.org OR site:sciencedirect.com OR site:nature.com)`;
      } else if (theoreticalPhysicsClass.isTheoreticalPhysics) {
        console.log('⚛️ Theoretical Physics & Quantum Mechanics search query detected. Appending theoretical physics site-restrictions...');
        finalQuery = `${finalQuery} (site:arxiv.org OR site:cern.ch OR site:aps.org OR site:physicsworld.com OR site:nature.com OR site:quantum-journal.org)`;
      } else if (paleontologyClass.isPaleontology) {
        console.log('🦕 Paleontology & Evolutionary Biology search query detected. Appending paleontology site-restrictions...');
        finalQuery = `${finalQuery} (site:paleosoc.org OR site:vertpaleo.org OR site:fossils-facts-and-finds.com OR site:nature.com OR site:ucmp.berkeley.edu OR site:amnh.org)`;
      } else if (biomedicalClass.isBiomedical) {
        console.log('🦾 Biomedical Engineering & Prosthetics search query detected. Appending biomedical site-restrictions...');
        finalQuery = `${finalQuery} (site:embs.org OR site:bmes.org OR site:pubmed.ncbi.nlm.nih.gov OR site:nature.com OR site:sciencedirect.com OR site:asme.org)`;
      } else if (climatologyClass.isClimatology) {
        console.log('🌍 Climatology & Paleoclimatology search query detected. Appending climatology site-restrictions...');
        finalQuery = `${finalQuery} (site:ipcc.ch OR site:ncdc.noaa.gov OR site:climate.nasa.gov OR site:wmo.int OR site:copernicus.eu OR site:nature.com)`;
      } else if (neurotechClass.isNeurotech) {
        console.log('🧠 Neurotechnology & BCI search query detected. Appending neurotech site-restrictions...');
        finalQuery = `${finalQuery} (site:neurotechx.com OR site:frontiersin.org OR site:nature.com OR site:pubmed.ncbi.nlm.nih.gov OR site:ieee.org OR site:bci-info.org)`;
      } else if (astrobiologyClass.isAstrobiology) {
        console.log('🌌 Astrobiology & Planetary Habitability search query detected. Appending astrobiology site-restrictions...');
        finalQuery = `${finalQuery} (site:nasa.gov OR site:astrobiology.nasa.gov OR site:nature.com OR site:liebertpub.com/ast OR site:planetary.org OR site:sciencedirect.com)`;
      } else if (nanotechClass.isNanotech) {
        console.log('🔬 Nanotechnology & Nanomaterials search query detected. Appending nanotech site-restrictions...');
        finalQuery = `${finalQuery} (site:nano.gov OR site:nature.com/nano OR site:nanotechweb.org OR site:sciencedirect.com OR site:ieee.org OR site:acs.org)`;
      } else if (nuclearClass.isNuclear) {
        console.log('⚛️ Nuclear Engineering & Fusion Technology search query detected. Appending nuclear engineering site-restrictions...');
        finalQuery = `${finalQuery} (site:iaea.org OR site:ans.org OR site:world-nuclear.org OR site:iter.org OR site:sciencedirect.com OR site:nature.com)`;
      } else if (geneticsClass.isGenetics) {
        console.log('🧬 Genetics & CRISPR Gene Editing search query detected. Appending gene-editing site-restrictions...');
        finalQuery = `${finalQuery} (site:broadinstitute.org OR site:nature.com/nrg OR site:pubmed.ncbi.nlm.nih.gov OR site:crisprjournal.com OR site:sciencedirect.com OR site:cell.com)`;
      } else if (ventureCapitalClass.isVentureCapital) {
        console.log('💼 Venture Capital & Startup Finance search query detected. Appending venture capital site-restrictions...');
        finalQuery = `${finalQuery} (site:nvca.org OR site:crunchbase.com OR site:pitchbook.com OR site:ycombinator.com OR site:sec.gov OR site:venturebeat.com)`;
      } else if (digitalHumanitiesClass.isDigitalHumanities) {
        console.log('📜 Digital Humanities & Cultural Heritage search query detected. Appending digital humanities site-restrictions...');
        finalQuery = `${finalQuery} (site:dh.org OR site:digitalhumanities.org OR site:ach.org OR site:mith.umd.edu OR site:loc.gov OR site:ox.ac.uk/research/digital-humanities)`;
      }
    }

    // pass extra params to CSE if you want recency/locale control
    if (Object.keys(params).length) rawGoogle.params = params;
    console.log('The final query before invoke', finalQuery);

    const results = await rawGoogle.invoke(finalQuery);
    const parsedResults = JSON.parse(results);
    const actualResultCount = Array.isArray(parsedResults)
      ? parsedResults.length
      : parsedResults.items
        ? parsedResults.items.length
        : 0;
    const requestedResults = params.num || 20;

    console.log(
      `Google Search Results: ${actualResultCount} results returned (requested: ${requestedResults})`
    );

    // Provide helpful information about result limitations
    if (actualResultCount < requestedResults) {
      console.log(
        `📊 Note: Google Custom Search API returned fewer results than requested. This is normal due to:`
      );
      console.log(
        `   • API limitations (free tier often limited to 10 results per query)`
      );
      console.log(`   • Search result availability for the specific query`);
      console.log(`   • Custom Search Engine configuration limits`);
    }

    if (isSportsQuery(query)) {
      console.log(
        `🏒 Sports query results: ${actualResultCount} from sports-specific sources`
      );
    }

    return results; // ToolMessages must be strings
  },
});

/**
 * Enhanced YouTube Search Tool for video content
 */
export class YouTubeSearchTool extends StructuredTool {
  name = 'youtube_search';
  description = `Search YouTube for video content. Use this tool when users specifically request videos, tutorials, demonstrations, or visual content.
  
  WHEN TO USE:
  - User explicitly asks for videos, tutorials, or demonstrations
  - Educational content that benefits from visual explanation
  - How-to guides, step-by-step instructions
  - Product reviews, unboxings, or comparisons
  - Entertainment content (music, movies, shows)
  - Visual learning content (art, cooking, fitness, etc.)
  
  DO NOT USE for simple factual questions that can be answered with text.`;

  schema = z.object({
    query: z
      .string()
      .describe(
        'YouTube search query - be specific about what type of video content is needed'
      ),
    maxResults: z
      .number()
      .min(1)
      .max(20)
      .default(5)
      .describe('Maximum number of video results to return (1-20)'),
    order: z
      .enum(['relevance', 'date', 'viewCount', 'rating'])
      .default('relevance')
      .describe('Sort order for results'),
    duration: z
      .enum(['any', 'short', 'medium', 'long'])
      .default('any')
      .describe('Video duration filter'),
  });

  constructor() {
    super();
    this.apiKey = config.youtube_api_key;
    if (!this.apiKey) {
      console.warn('YouTube API key not configured');
    }
  }

  async _call({
    query,
    maxResults = 5,
    order = 'relevance',
    duration = 'any',
  }) {
    try {
      if (!this.apiKey) {
        return JSON.stringify({
          success: false,
          error: 'YouTube API key not configured',
          query: query,
        });
      }

      console.log(`🎥 YouTube Search Tool called with query: "${query}"`);

      const searchURL = 'https://www.googleapis.com/youtube/v3/search';
      const params = new URLSearchParams({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: maxResults.toString(),
        order: order,
        key: this.apiKey,
        safeSearch: 'moderate',
        relevanceLanguage: 'en',
      });

      if (duration !== 'any') {
        params.append('videoDuration', duration);
      }

      const response = await fetch(`${searchURL}?${params}`);

      if (!response.ok) {
        throw new Error(
          `YouTube API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      const videoResults = (data.items || []).map((item, index) => {
        const snippet = item.snippet;
        return {
          title: snippet.title,
          description: snippet.description,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          videoId: item.id.videoId,
          channelTitle: snippet.channelTitle,
          publishedAt: snippet.publishedAt,
          thumbnails: snippet.thumbnails,
          source: 'youtube',
          citationIndex: index + 1,
        };
      });

      return JSON.stringify(
        {
          success: true,
          query: query,
          results: videoResults,
          totalResults: videoResults.length,
          source: 'youtube',
        },
        null,
        2
      );
    } catch (error) {
      console.error('❌ YouTubeSearchTool Error:', error);

      return JSON.stringify({
        success: false,
        error: 'Failed to search YouTube',
        errorDetails: error.message,
        query: query,
      });
    }
  }
}

/**
 * NewsAPI.ai / Event Registry Global News Intelligence Tool
 */
export const newsapiGlobalNewsSearch = new DynamicStructuredTool({
  name: 'newsapi_global_news_search',
  description: `Access Event Registry / NewsAPI.ai global news intelligence. Use for ANY query about:
- Real-time global news monitoring, news event streams, or concept trends
- Sentiment trends and sentiment vectors for specific topics (positive/negative/neutral)
- Verification of news article counts and citation counts in the last 24h
- Social share densities (aggregated social shares across networks)
- Industry category tracking and trust indices
Input: A natural language query or topic to search global news intelligence (e.g. "Artificial Intelligence trends", "Bitcoin news sentiment", "climate change monitored articles").`,
  schema: z.object({
    query: z.string().describe("Topic or query to fetch news intelligence for"),
  }),
  func: async ({ query }) => {
    try {
      const result = await getNewsApiAiData(query);
      return result.markdown;
    } catch (err) {
      return `News intelligence lookup failed: ${err.message}`;
    }
  }
});

/**
 * Alti Greenlight Public Intelligence Search Tool
 */
export const altiGreenlightIntelligenceSearch = new DynamicStructuredTool({
  name: 'alti_greenlight_intelligence_search',
  description: `Access nine highly targeted public intelligence databases. Use this tool for ANY query regarding:
1. "politics_campaign" -> FEC political donations, campaign financing, PAC cash flow.
2. "legislation_tracking" -> LegiScan state/federal bill tracking, roll call voting records, bill sponsors.
3. "civic_representatives" -> Google Civic representative mapping, local congressional districts, elected officials by address.
4. "macroeconomics_global" -> DBnomics multi-agency statistical indexes (aggregating IMF, World Bank, OECD).
5. "mortgage_lending" -> CFPB HMDA mortgage loan approval ratios, loan application metrics, loan-to-value by census tract.
6. "disaster_hazards" -> OpenFEMA regional flood zone maps, disaster declarations, mitigation relief grant volumes.
7. "medical_research" -> NIH RePORTER research grant allocations, active medical study budgets, leading facilities.
8. "uk_company_registry" -> Companies House UK registered numbers, directors, annual account filing profiles.
9. "global_entity_registry" -> OpenCorporates international parent-subsidiary mappings and corporate registrations.
Input: The domain enum name (politics_campaign, legislation_tracking, civic_representatives, macroeconomics_global, mortgage_lending, disaster_hazards, medical_research, uk_company_registry, global_entity_registry) and a query string (topic, address, company name, or CIK).`,
  schema: z.object({
    domain: z.enum([
      'politics_campaign',
      'legislation_tracking',
      'civic_representatives',
      'macroeconomics_global',
      'mortgage_lending',
      'disaster_hazards',
      'medical_research',
      'uk_company_registry',
      'global_entity_registry'
    ]).describe("The target database domain sector to query"),
    query: z.string().describe("Topic, address, company name, CIK, or region to query within the domain")
  }),
  func: async ({ domain, query }) => {
    try {
      const result = await getGreenlightIntelligenceData(domain, query);
      return result.markdown;
    } catch (err) {
      return `Public intelligence lookup failed: ${err.message}`;
    }
  }
});

/**
 * Alti Premium Public Intelligence Search Tool
 */
export const altiPremiumIntelligenceSearch = new DynamicStructuredTool({
  name: 'alti_premium_intelligence_search',
  description: `Access twenty-three high-value premium public intelligence databases. Use this tool for ANY query regarding:
1. "clinical_trials" -> ClinicalTrials.gov global clinical trial registries, study recruitment, enrollment stats, drug trial phases.
2. "fda_drug_safety" -> openFDA drug safety warnings, adverse event counts, recall enforcement records, labeling details.
3. "global_health_observatory" -> WHO (World Health Organization) statistics, life expectancy trends, immunizations, cross-country metrics.
4. "us_treasury_fiscal" -> U.S. Treasury sovereign debt figures, daily government cash balance, federal spending budgets, tax revenues.
5. "federal_spending" -> USAspending.gov federal contract awards, grants, agency spending, and recipient profiles.
6. "healthcare_npi" -> CMS NPPES National Provider Identifier (NPI) lookup, clinician registry, business address, and specialty licenses.
7. "food_nutrients" -> USDA FoodData Central nutritional values, brand products, calorie/carb/protein breakdowns, and ingredients.
8. "charity_registry" -> IRS tax-exempt Publication 78 charity database, active EIN standings, and IRS subsection codes.
9. "aviation_delays" -> FAA Airport Status real-time flight delays, ground stops, weather causes, and airspace capacities.
10. "rxnorm" -> Standardized drug clinical vocabulary concepts, RxCUI identifiers, normalized drug names, and term types.
11. "dailymed" -> FDA Structured Product Labeling (SPL) package inserts, manufacturer label sheets, and publication dates.
12. "open_food_facts" -> Global collaborative branded food facts, barcodes (UPC/EAN), brands, and ingredients.
13. "pubchem" -> Chemical structures, properties (molecular formula, weight, XLogP, TPSA), and compound CID records.
14. "fdic_bankfind" -> FDIC BankFind database containing active/failed institutions, certified numbers, asset holdings, net income, and asset ratios.
15. "cfpb_complaints" -> CFPB Consumer Complaint Database for product disputes, consumer financial logs, and resolutions.
16. "sec_edgar" -> SEC EDGAR database to fetch zero-padded corporate CIKs and corporate financials (GAAP XBRL facts like NetIncomeLoss, Revenues, Assets, Liabilities).
17. "census_bps" -> U.S. Census Bureau Building Permits Survey (BPS) for residential construction permits, authorized units, and permit valuations by region/state.
18. "courtlistener" -> CourtListener RECAP legal case dockets, litigation standing profiles, and judge assignments.
19. "harvard_caselaw" -> Harvard Caselaw Access Project (CAP) legal court precedents, decision dates, and official binding citations.
20. "cisa_kev" -> CISA Known Exploited Vulnerabilities catalog for threat intelligence, active exploits, and remediation due dates.
21. "nist_nvd_cve" -> NIST National Vulnerability Database (NVD) for CVE lookup, CVSS scores, vulnerability severity levels, and vectors.
22. "ofac_sanctions" -> U.S. OFAC Sanctions SDN Compliance Registry for screening matches, UID standings, and asset blocking verdicts.
23. "fara_foreign_agents" -> DOJ Foreign Agents Registration Act (FARA) lobbying disclosures, registration numbers, and country principal records.
Input: The domain enum name and a query string (topic, NPI, EIN, barcode, chemical name, drug name, bank name, company name, corporate ticker, or state/region name).`,
  schema: z.object({
    domain: z.enum([
      'clinical_trials',
      'fda_drug_safety',
      'global_health_observatory',
      'us_treasury_fiscal',
      'federal_spending',
      'healthcare_npi',
      'food_nutrients',
      'charity_registry',
      'aviation_delays',
      'rxnorm',
      'dailymed',
      'open_food_facts',
      'pubchem',
      'fdic_bankfind',
      'cfpb_complaints',
      'sec_edgar',
      'census_bps',
      'courtlistener',
      'harvard_caselaw',
      'cisa_kev',
      'nist_nvd_cve',
      'ofac_sanctions',
      'fara_foreign_agents'
    ]).describe("The target premium database sector to query"),
    query: z.string().describe("Sanitized topic, NPI, EIN, barcode, chemical, drug, bank, company, ticker, or region query within the premium domain")
  }),
  func: async ({ domain, query }) => {
    try {
      if (['courtlistener', 'harvard_caselaw', 'cisa_kev', 'nist_nvd_cve', 'ofac_sanctions', 'fara_foreign_agents'].includes(domain)) {
        const result = await getPremiumV17IntelligenceData(domain, query);
        return result.markdown;
      }
      if (['fdic_bankfind', 'cfpb_complaints', 'sec_edgar', 'census_bps'].includes(domain)) {
        const result = await getPremiumV16IntelligenceData(domain, query);
        return result.markdown;
      }
      const result = await getPremiumIntelligenceData(domain, query);
      return result.markdown;
    } catch (err) {
      return `Premium intelligence lookup failed: ${err.message}`;
    }
  }
});
