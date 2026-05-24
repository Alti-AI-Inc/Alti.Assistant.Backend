/**
 * UnifiedSmartRouter.js — The Modern Core Router for Alti's Data-Grounding Engine
 *
 * Serves as a backward-compatible drop-in replacement for the massive legacy promise-tree
 * smart routers. Dispatches all grounding query audits directly to the high-performance,
 * parallel, self-registering SearchEngineRegistry.
 */

import { SearchEngineRegistry } from './SearchEngineRegistry.js';
import { logger } from '../../shared/logger.js';

export const UnifiedSmartRouter = {
  /**
   * Primary prompt enhancer. Routes queries platform-wide concurrently across all 110+ data streams.
   * @param {string} prompt - Raw user query.
   * @returns {Promise<string>} - Context-injected prompt.
   */
  async combinedRouteAndEnhancePrompt(prompt) {
    logger.info(`[UnifiedSmartRouter] Enhancing query: "${prompt?.substring(0, 50)}..."`);
    return SearchEngineRegistry.combinedRouteAndEnhance(prompt);
  },

  /**
   * Utility to parse and flatten downstream JSON_METADATA string blocks.
   * @param {string} prompt - Context-injected enhanced prompt.
   * @returns {Object} - Flattened metadata object.
   */
  extractAndFlattenMetadata(prompt) {
    if (!prompt || typeof prompt !== 'string') return {};
    const match = prompt.match(/<!-- JSON_METADATA:\s*(\{.*?\})\s*-->/);
    if (!match) return {};
    try {
      const nested = JSON.parse(match[1]);
      const flattened = {};
      for (const providerId of Object.keys(nested)) {
        const data = nested[providerId];
        if (data && typeof data === 'object') {
          Object.assign(flattened, data);
        }
      }
      
      // Keep a non-enumerable reference to the nested metadata for citation stitching
      Object.defineProperty(flattened, '__nested__', {
        value: nested,
        enumerable: false,
        writable: true,
        configurable: true
      });
      
      return flattened;
    } catch (err) {
      logger.warn(`[UnifiedSmartRouter] Failed to parse JSON_METADATA: ${err.message}`);
      return {};
    }
  },

  /**
   * Stitches and deduplicates references and citations from Gemini native search and custom providers.
   * @param {Array} providerReferences - Array of references from registry providers.
   * @param {Object} googleGroundingMetadata - Gemini native grounding metadata object.
   * @returns {Object} - Deduplicated references and citations.
   */
  stitchAndDeduplicateCitations(jsonMetadata = {}, googleGroundingMetadata = null, extraReferences = []) {
    const references = [];
    const usedUrls = new Set();

    const normalizeUrl = (urlStr) => {
      if (!urlStr || typeof urlStr !== 'string') return '';
      try {
        let cleaned = urlStr.toLowerCase().trim();
        if (cleaned.endsWith('/')) {
          cleaned = cleaned.slice(0, -1);
        }
        return cleaned;
      } catch {
        return urlStr.toLowerCase().trim();
      }
    };

    // 1. Process custom provider references from jsonMetadata (resolving nested metadata if wrapped in a flattened object)
    const targetMetadata = jsonMetadata && jsonMetadata.__nested__ ? jsonMetadata.__nested__ : jsonMetadata;
    if (targetMetadata && typeof targetMetadata === 'object') {
      Object.keys(targetMetadata).forEach(providerId => {
        let title = 'Data Partner Reference';
        let url = 'https://altiapp.com';
        let domain = 'altiapp.com';

        if (providerId === 'sports_odds') {
          title = 'PredictionData.io Live Sports Odds Feed';
          url = 'https://predictiondata.io';
          domain = 'predictiondata.io';
        } else if (providerId === 'real_estate') {
          title = 'RealEstateAPI.com Property Data Feed';
          url = 'https://realestateapi.com';
          domain = 'realestateapi.com';
        } else if (providerId === 'financial_ticker') {
          title = 'Massive.com Real-Time Stock Feed';
          url = 'https://massive.com';
          domain = 'massive.com';
        } else if (providerId === 'aviationstack') {
          title = 'AviationStack.com Real-Time Flight & Delay Feed';
          url = 'https://aviationstack.com';
          domain = 'aviationstack.com';
        } else if (providerId === 'bls_economic') {
          title = 'Bureau of Labor Statistics (BLS) Consumer Price & Labor Registry';
          url = 'https://bls.gov';
          domain = 'bls.gov';
        } else if (providerId === 'bea_economic') {
          title = 'Bureau of Economic Analysis (BEA) GDP & Personal Incomes Feed';
          url = 'https://bea.gov';
          domain = 'bea.gov';
        } else if (providerId === 'congress_gov') {
          title = 'Congress.gov Official Legislative and Voting Roll';
          url = 'https://congress.gov';
          domain = 'congress.gov';
        } else if (providerId === 'opensecrets') {
          title = 'OpenSecrets.org Political PAC & Lobbying Database';
          url = 'https://opensecrets.org';
          domain = 'opensecrets.org';
        } else if (providerId === 'sam_gov') {
          title = 'SAM.gov Vendor Exclusion & Federal Contracting Register';
          url = 'https://sam.gov';
          domain = 'sam.gov';
        } else if (providerId === 'gao_reports') {
          title = 'U.S. Government Accountability Office (GAO) Oversight Database';
          url = 'https://gao.gov';
          domain = 'gao.gov';
        } else if (providerId === 'ecfr_regulations') {
          title = 'Electronic Code of Federal Regulations (eCFR) Registry';
          url = 'https://ecfr.gov';
          domain = 'ecfr.gov';
        } else if (providerId === 'federal_register') {
          title = 'U.S. Federal Register Daily Executive and Administrative Gazeteer';
          url = 'https://federalregister.gov';
          domain = 'federalregister.gov';
        } else if (providerId === 'epa_echo') {
          title = 'EPA ECHO (Enforcement & Compliance History Online) Database';
          url = 'https://echo.epa.gov';
          domain = 'echo.epa.gov';
        } else if (providerId === 'osha_inspections') {
          title = 'OSHA Workplace Safety and Employer Enforcement Registry';
          url = 'https://osha.gov';
          domain = 'osha.gov';
        } else if (providerId === 'un_comtrade') {
          title = 'UN Comtrade Database for Global Bilateral Trade';
          url = 'https://comtrade.un.org';
          domain = 'comtrade.un.org';
        } else if (providerId === 'census_trade') {
          title = 'U.S. Census Bureau International Trade Registry';
          url = 'https://census.gov';
          domain = 'census.gov';
        } else if (providerId === 'dbnomics') {
          title = 'DBnomics Global Macroeconomic Database Feed';
          url = 'https://db.nomics.world';
          domain = 'db.nomics.world';
        } else if (providerId === 'world_bank') {
          title = 'World Bank Development and Sovereign Wealth Indicators';
          url = 'https://worldbank.org';
          domain = 'worldbank.org';
        } else if (providerId === 'lda_lobbying') {
          title = 'U.S. Senate Lobbying Disclosure Act (LDA) Registry';
          url = 'https://lobbyingdisclosure.senate.gov';
          domain = 'lobbyingdisclosure.senate.gov';
        } else if (providerId === 'open_fec') {
          title = 'OpenFEC Campaign Finance and Political Action Committee Registry';
          url = 'https://fec.gov';
          domain = 'fec.gov';
        } else if (providerId === 'nih_reporter') {
          title = 'NIH RePORTER Medical and Scientific Funding Registry';
          url = 'https://reporter.nih.gov';
          domain = 'reporter.nih.gov';
        } else if (providerId === 'chembl_database') {
          title = 'ChEMBL Bioactive Molecule & Drug Targets Registry';
          url = 'https://ebi.ac.uk/chembl';
          domain = 'ebi.ac.uk';
        } else if (providerId === 'clinvar_database') {
          title = 'ClinVar Genomic Pathogenicity & Variant Registry';
          url = 'https://ncbi.nlm.nih.gov/clinvar';
          domain = 'ncbi.nlm.nih.gov';
        } else if (providerId === 'uniprot_database') {
          title = 'UniProt Protein Knowledgebase and Annotation Registry';
          url = 'https://uniprot.org';
          domain = 'uniprot.org';
        } else if (providerId === 'eia_energy') {
          title = 'U.S. Energy Information Administration (EIA) Energy Feed';
          url = 'https://eia.gov';
          domain = 'eia.gov';
        } else if (providerId === 'govinfo_gpo') {
          title = 'GPO GovInfo Official Federal Publishing Registry';
          url = 'https://govinfo.gov';
          domain = 'govinfo.gov';
        } else if (providerId === 'openalex_papers') {
          title = 'OpenAlex Scholarly and Academic Literature Index';
          url = 'https://openalex.org';
          domain = 'openalex.org';
        } else if (providerId === 'arxiv_preprints') {
          title = 'arXiv.org Scientific Preprint and Publication Roll';
          url = 'https://arxiv.org';
          domain = 'arxiv.org';
        } else if (providerId === 'gnomad_genomics') {
          title = 'gnomAD Population Variant & Genome Rarity Registry';
          url = 'https://gnomad.broadinstitute.org';
          domain = 'gnomad.broadinstitute.org';
        } else if (providerId === 'ensembl_genomics') {
          title = 'Ensembl Genomic Browser & Variant Consequence Registry';
          url = 'https://ensembl.org';
          domain = 'ensembl.org';
        } else if (providerId === 'pdb_structures') {
          title = 'Protein Data Bank (PDB) 3D Experimental Structures';
          url = 'https://rcsb.org';
          domain = 'rcsb.org';
        } else if (providerId === 'alphafold_structures') {
          title = 'AlphaFold Structural Database & Boundaries Predictor';
          url = 'https://alphafold.ebi.ac.uk';
          domain = 'alphafold.ebi.ac.uk';
        } else if (providerId === 'gtex_expression') {
          title = 'GTEx Quantitative RNA Tissue Expression Registry';
          url = 'https://gtexportal.org';
          domain = 'gtexportal.org';
        } else if (providerId === 'human_protein_atlas') {
          title = 'Human Protein Atlas (HPA) Spatial Expression Registry';
          url = 'https://proteinatlas.org';
          domain = 'proteinatlas.org';
        } else if (providerId === 'ncbi_sequences') {
          title = 'NCBI Nucleotide & Protein Sequence Database';
          url = 'https://ncbi.nlm.nih.gov/nuccore';
          domain = 'ncbi.nlm.nih.gov';
        } else if (providerId === 'reactome_pathways') {
          title = 'Reactome Biological Pathways & Reactions Registry';
          url = 'https://reactome.org';
          domain = 'reactome.org';
        } else if (providerId === 'string_interactions') {
          title = 'STRING Protein-Protein Interaction (PPI) Network';
          url = 'https://string-db.org';
          domain = 'string-db.org';
        } else if (providerId === 'interpro_domains') {
          title = 'InterPro Protein Family & Domain Database';
          url = 'https://ebi.ac.uk/interpro';
          domain = 'ebi.ac.uk';
        } else if (providerId === 'biorxiv_preprints') {
          title = 'bioRxiv Biology Preprint Repository';
          url = 'https://biorxiv.org';
          domain = 'biorxiv.org';
        } else if (providerId === 'europe_pmc') {
          title = 'Europe PMC Open-Access Literature Index';
          url = 'https://europepmc.org';
          domain = 'europepmc.org';
        } else if (providerId === 'jaspar_motifs') {
          title = 'JASPAR Transcription Factor Binding Profiles';
          url = 'https://jaspar.elixir.no';
          domain = 'jaspar.elixir.no';
        } else if (providerId === 'ucsc_conservation') {
          title = 'UCSC Genome Browser Evolutionary Conservation Scores';
          url = 'https://genome.ucsc.edu';
          domain = 'genome.ucsc.edu';
        } else if (providerId === 'encode_ccres') {
          title = 'ENCODE SCREEN cis-Regulatory Elements Registry';
          url = 'https://encodeproject.org';
          domain = 'encodeproject.org';
        } else if (providerId === 'alphagenome_variants') {
          title = 'AlphaGenome Variant Effect Predictor Registry';
          url = 'https://alphagenome.org';
          domain = 'alphagenome.org';
        } else if (providerId === 'dbsnp_variants') {
          title = 'dbSNP Short Genetic Variants Database';
          url = 'https://ncbi.nlm.nih.gov/snp';
          domain = 'ncbi.nlm.nih.gov';
        } else if (providerId === 'embl_ebi_ols') {
          title = 'EMBL-EBI Ontology Lookup Service';
          url = 'https://ebi.ac.uk/ols';
          domain = 'ebi.ac.uk';
        } else if (providerId === 'foldseek_search') {
          title = 'Foldseek Protein 3D Structural Similarity Search';
          url = 'https://foldseek.com';
          domain = 'foldseek.com';
        } else if (providerId === 'unibind_tfbs') {
          title = 'UniBind Experimentally Validated Transcription Factor Bindings';
          url = 'https://unibind.uio.no';
          domain = 'unibind.uio.no';
        } else if (providerId === 'protein_msa') {
          title = 'Clustal Omega Protein Multiple Sequence Alignment';
          url = 'https://ebi.ac.uk/clustalw';
          domain = 'ebi.ac.uk';
        } else if (providerId === 'gold_commodities') {
          title = 'Precious Metals Spot Market Index';
          url = 'https://goldprice.org';
          domain = 'goldprice.org';
        } else if (providerId === 'crypto_quotes') {
          title = 'Live Cryptocurrency Market Cap & Quote Feed';
          url = 'https://coinmarketcap.com';
          domain = 'coinmarketcap.com';
        } else if (providerId === 'nasa_neo_asteroids') {
          title = 'NASA Near-Earth Object (NEO) Asteroid Tracker';
          url = 'https://neo.jpl.nasa.gov';
          domain = 'neo.jpl.nasa.gov';
        } else if (providerId === 'mitre_attack_matrix') {
          title = 'MITRE ATT&CK Threat Matrix & Tactics Registry';
          url = 'https://attack.mitre.org';
          domain = 'attack.mitre.org';
        } else if (providerId === 'sec_form4_insiders') {
          title = 'SEC Form 4 Real-Time Insider Transactions';
          url = 'https://sec.gov/edgar';
          domain = 'sec.gov';
        } else if (providerId === 'github_api_repos') {
          title = 'GitHub API Repository Statistics Feed';
          url = 'https://github.com';
          domain = 'github.com';
        } else if (providerId === 'wikipedia_search') {
          title = 'Wikipedia Free Encyclopedia Index';
          url = 'https://wikipedia.org';
          domain = 'wikipedia.org';
        } else if (providerId === 'wikidata_entities') {
          title = 'Wikidata Semantic Knowledge Graph';
          url = 'https://wikidata.org';
          domain = 'wikidata.org';
        } else if (providerId === 'openweathermap_weather') {
          title = 'OpenWeatherMap Global Weather Feed';
          url = 'https://openweathermap.org';
          domain = 'openweathermap.org';
        } else if (providerId === 'openstreetmap_geocoding') {
          title = 'OpenStreetMap Geocoding and Place Index';
          url = 'https://openstreetmap.org';
          domain = 'openstreetmap.org';
        } else if (providerId === 'zenodo_research') {
          title = 'Zenodo Open Science Research Repository';
          url = 'https://zenodo.org';
          domain = 'zenodo.org';
        } else if (providerId === 'crossref_dois') {
          title = 'Crossref DOI Metadata Index';
          url = 'https://crossref.org';
          domain = 'crossref.org';
        } else if (providerId === 'nhc_hurricanes') {
          title = 'National Hurricane Center Tropical Advisories';
          url = 'https://nhc.noaa.gov';
          domain = 'nhc.noaa.gov';
        } else if (providerId === 'fcc_licensing') {
          title = 'FCC Wireless License Registry Database';
          url = 'https://fcc.gov';
          domain = 'fcc.gov';
        } else if (providerId === 'usda_soil_survey') {
          title = 'USDA Plant Hardiness & Soil Survey Index';
          url = 'https://usda.gov';
          domain = 'usda.gov';
        } else if (providerId === 'airnow_aqi') {
          title = 'AirNow Global Air Quality Index Feed';
          url = 'https://airnow.gov';
          domain = 'airnow.gov';
        } else if (providerId === 'usps_zip_lookup') {
          title = 'USPS ZIP Code Registry Database';
          url = 'https://usps.com';
          domain = 'usps.com';
        } else if (providerId === 'noaa_marine_tides') {
          title = 'NOAA Coastal Buoy Wave & Tide Feed';
          url = 'https://ndbc.noaa.gov';
          domain = 'ndbc.noaa.gov';
        } else if (providerId === 'sec_form3_ownership') {
          title = 'SEC Form 3 Initial Beneficial Ownership';
          url = 'https://sec.gov/edgar';
          domain = 'sec.gov';
        } else if (providerId === 'openlibrary_books') {
          title = 'Open Library Book Catalog & ISBN Index';
          url = 'https://openlibrary.org';
          domain = 'openlibrary.org';
        } else if (providerId === 'openmeteo_radiation') {
          title = 'OpenMeteo Solar & UV Radiation Forecast';
          url = 'https://open-meteo.com';
          domain = 'open-meteo.com';
        } else if (providerId === 'internet_archive_items') {
          title = 'Internet Archive Metadata Index';
          url = 'https://archive.org';
          domain = 'archive.org';
        } else if (providerId === 'nifc_wildfires') {
          title = 'National Interagency Fire Center Wildfire Incident Feed';
          url = 'https://nifc.gov';
          domain = 'nifc.gov';
        } else if (providerId === 'pmc_open_access') {
          title = 'PMC Open Access Subset Document Registry';
          url = 'https://ncbi.nlm.nih.gov/pmc';
          domain = 'ncbi.nlm.nih.gov';
        } else if (providerId === 'airline_routes') {
          title = 'Airline Schedules & Route Network Feed';
          url = 'https://aviationstack.com';
          domain = 'aviationstack.com';
        } else {
          title = `${providerId.replace(/_/g, ' ').toUpperCase()} Registry`;
          url = `https://${providerId.replace(/_/g, '')}.gov`;
          domain = `${providerId.replace(/_/g, '')}.gov`;
        }

        const normalized = normalizeUrl(url);
        if (!usedUrls.has(normalized)) {
          usedUrls.add(normalized);
          references.push({ url, domain, title });
        }
      });
    }

    // 2. Process any extra references (like YouTube videos or local GCP catalog)
    if (Array.isArray(extraReferences)) {
      extraReferences.forEach(ref => {
        if (!ref || !ref.url) return;
        const normalized = normalizeUrl(ref.url);
        if (!usedUrls.has(normalized)) {
          usedUrls.add(normalized);
          references.push({
            url: ref.url,
            domain: ref.domain || new URL(ref.url).hostname.replace('www.', ''),
            title: ref.title || 'Reference Link'
          });
        }
      });
    }

    // 3. Process native Google Search grounding references next
    if (googleGroundingMetadata?.groundingChunks) {
      googleGroundingMetadata.groundingChunks.forEach(chunk => {
        if (!chunk.web?.uri) return;
        const normalized = normalizeUrl(chunk.web.uri);
        if (!usedUrls.has(normalized)) {
          usedUrls.add(normalized);
          try {
            const urlObj = new URL(chunk.web.uri);
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || urlObj.hostname.replace('www.', ''),
              title: chunk.web.title || 'Web Search Grounding'
            });
          } catch {
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || 'web',
              title: chunk.web.title || 'Web Grounding'
            });
          }
        }
      });
    }

    // 4. Resilient Fallback if no citations found
    if (references.length === 0) {
      references.push({
        url: 'https://google.com',
        domain: 'google.com',
        title: 'Google Search Index Grounding'
      });
    }

    // 5. Keep top 5 premium references
    const limitedReferences = references.slice(0, 5);

    // 5. Generate structured index-based citations
    const citations = limitedReferences.map((ref, index) => ({
      index: index + 1,
      url: ref.url,
      domain: ref.domain,
      title: ref.title
    }));

    return {
      references: limitedReferences,
      citations
    };
  },

  /**
   * Drop-in alias for backward compatibility.
   */
  async routeAndEnhancePrompt(prompt) {
    return this.combinedRouteAndEnhancePrompt(prompt);
  },

  /**
   * Intent classifiers kept for legacy dependency layers.
   */
  detectFinancialIntent(query) {
    if (!query || typeof query !== 'string') return false;
    // Auto-detect based on registered financial providers
    const financialKeywords = /\b(stock|price|ticker|options? chain|rsi|macd|sma|ema|fdic|bank|sec|edgar|cik|xbrl)\b/i;
    return financialKeywords.test(query);
  },

  detectMultipleTickers(query) {
    if (!query) return [];
    const tickerRegex = /\b[A-Z]{1,5}\b/g;
    const matches = query.match(tickerRegex) || [];
    return [...new Set(matches)].filter(t => t !== 'REIT' && t !== 'SEC' && t !== 'EDGAR' && t !== 'FDA' && t !== 'WHO');
  },

  detectSportsIntent(query) {
    if (!query || typeof query !== 'string') return false;
    const sportsKeywords = /\b(odds|betting|expert picks|sports futures|parlay|arbitrage|value bet)\b/i;
    return sportsKeywords.test(query);
  },

  detectRealEstateIntent(query) {
    if (!query || typeof query !== 'string') return false;
    const reKeywords = /\b(real estate|property value|home comps|conforming limit|mortgage limit)\b/i;
    return reKeywords.test(query);
  }
};
export default UnifiedSmartRouter;
