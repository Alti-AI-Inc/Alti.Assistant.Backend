import {
  llmToolCall, llmStream, llmGenerateImage, llmImageToImage,
  llmGenerateVideo, llmGetVideoMetadata, llmTextToSpeech, llmStreamTTS,
  llmVisionChat, llmCodeInterpreter, llmReasoningChat, llmRerank,
  llmTranscribeAudio, llmRealtimeTTSConfig, llmRealtimeSTTConfig
} from '../../services/llm.client.js';
import { searchSECFillings } from '../sec/sec.service.js';
import { logger } from '../../../shared/logger.js';

// Import backend services
import { ExaSearchService } from '../ExaSearch/exaSearch.service.js';
import { ComposioService } from '../composio/composio.service.js';
import { VisualCrossingService } from '../visualcrossing/visualcrossing.service.js';
import { AviationStackService } from '../aviationstack/aviationstack.service.js';
import { CodexService } from '../codex/codex.service.js';
import { OpenClawService } from '../openclaw/openclaw.service.js';
import { ExploriumService } from '../explorium/explorium.service.js';
import { CoinApiService } from '../coinapi/coinapi.service.js';
import { MassiveService } from '../massive/massive.service.js';
import { ApiSportsService } from '../apisports/apisports.service.js';
import { PredictionDataService } from '../predictiondata/predictiondata.service.js';
import { NewsApiService } from '../newsapi/newsapi.service.js';
import realEstateApiService from '../realestateapi/realestateapi.service.js';
import fredService from '../fred/fred.service.js';
import arxivService from '../arxiv/arxiv.service.js';
import congressService from '../congress/congress.service.js';
import openfdaService from '../openfda/openfda.service.js';
import censusService from '../census/census.service.js';
import { LangGraphService } from '../langchain/langchain.langgraph.service.js';
import { LangChainService } from '../langchain/langchain.service.js';
import { CommunityIntegrationsService } from '../langchain/langchain.community.service.js';
import { TemporalService } from '../temporal/temporal.service.js';
import { LibertyService } from '../liberty/liberty.service.js';
import { MapboxService } from '../mapbox/mapbox.service.js';

// Define schemas for the LLM
const tools = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the live web for real-time information, news, or facts using Exa.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, numResults: { type: 'number' } }, required: ['query'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_code_sandbox',
      description: 'Write and execute JavaScript code in a secure V8 sandbox to solve math, process data, or verify logic.',
      parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_edge_command',
      description: 'Queue a bash script or system command to a remote OpenClaw Edge VM (e.g. vm-sovereign-01).',
      parameters: { type: 'object', properties: { machineId: { type: 'string' }, command: { type: 'string' }, payload: { type: 'object' } }, required: ['machineId', 'command', 'payload'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'trigger_app_action',
      description: 'Execute a third-party app action (e.g. GitHub, Slack, Linear) via Composio.',
      parameters: { type: 'object', properties: { tool_slug: { type: 'string' }, params: { type: 'object' } }, required: ['tool_slug', 'params'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get real-time weather forecasts for a specific location.',
      parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_flights',
      description: 'Get live flight tracking information by flight number.',
      parameters: { type: 'object', properties: { flight_number: { type: 'string' } }, required: ['flight_number'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'research_company',
      description: 'Get B2B intelligence and firmographics for a company using Explorium.',
      parameters: { type: 'object', properties: { company_name: { type: 'string' } }, required: ['company_name'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_crypto_price',
      description: 'Get live cryptocurrency prices and exchange rates.',
      parameters: { type: 'object', properties: { base_asset: { type: 'string', description: 'e.g. BTC' }, quote_asset: { type: 'string', description: 'e.g. USD' } }, required: ['base_asset', 'quote_asset'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_stock_aggregates',
      description: 'Get stock market aggregates/candles for a ticker symbol via Massive.',
      parameters: { type: 'object', properties: { ticker: { type: 'string' }, multiplier: { type: 'number' }, timespan: { type: 'string', description: 'day, minute' }, from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['ticker', 'multiplier', 'timespan', 'from', 'to'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sports_fixtures',
      description: 'Get live sports fixtures and scores.',
      parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['date'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_prediction_markets',
      description: 'Get live prediction market odds from Polymarket/Kalshi.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
    }
  },
  
  {
    type: 'function',
    function: {
      name: 'get_real_estate_property',
      description: 'Get comprehensive details about a real estate property including valuation and comps. This triggers a custom Real Estate UI for the user.',
      parameters: { type: 'object', properties: { address: { type: 'string', description: 'Full street address including city, state, zip' } }, required: ['address'] }
    }
  },
  
  {
    type: 'function',
    function: {
      name: 'get_economic_data',
      description: 'Get macroeconomic data, inflation, interest rates, GDP, and labor statistics from the Federal Reserve Economic Data (FRED) API.',
      parameters: { type: 'object', properties: { series_id: { type: 'string', description: 'The FRED series ID, e.g., CPIAUCSL for Inflation, FEDFUNDS for Interest Rates' } }, required: ['series_id'] }
    }
  },
  
  {
    type: 'function',
    function: {
      name: 'search_academic_papers',
      description: 'Search for peer-reviewed academic papers, scientific research, and preprints from the arXiv API. Use this for deep scientific, mathematical, or medical research.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'The search query (e.g. quantum computing, transformers, mRNA)' }, max_results: { type: 'number', description: 'Number of results to return (max 10)' } }, required: ['query'] }
    }
  },
  
  {
    type: 'function',
    function: {
      name: 'get_legislative_bills',
      description: 'Search and retrieve details about US congressional bills, legislation, and federal registers from the official Congress.gov API.',
      parameters: { type: 'object', properties: { congress: { type: 'string', description: 'Congress number (e.g. 118)' }, billType: { type: 'string', description: 'Bill type (e.g. hr, s)' }, billNumber: { type: 'string' } } }
    }
  },
  
  {
    type: 'function',
    function: {
      name: 'search_fda_drugs',
      description: 'Search the FDA database for drug labels, warnings, and adverse events using the official OpenFDA API.',
      parameters: { type: 'object', properties: { search: { type: 'string', description: 'Drug name or query' } }, required: ['search'] }
    }
  },
  
  {
    type: 'function',
    function: {
      name: 'get_census_data',
      description: 'Get demographic, housing, or economic data from the US Census Bureau.',
      parameters: { type: 'object', properties: { year: { type: 'string', description: 'Year, e.g. 2021' }, state: { type: 'string', description: 'State FIPS code (e.g. 06 for CA) or *' }, type: { type: 'string', description: 'Type of data: population or economy' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_latest_news',
      description: 'Get breaking news articles for a given topic.',
      parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] }
    }
  },
  // ─── NEW TOGETHER AI-POWERED TOOLS ──────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'edit_image',
      description: 'Edit, transform, or create variations of an existing image using AI. Can also generate a new image from scratch. Use FLUX Kontext for editing and FLUX.1-schnell-Free for generation.',
      parameters: { type: 'object', properties: {
        prompt: { type: 'string', description: 'Description of what to generate or how to edit the image' },
        source_image_url: { type: 'string', description: 'URL of the image to edit (optional, omit for text-to-image)' }
      }, required: ['prompt'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_video',
      description: 'Generate a short video clip from a text description using AI video generation.',
      parameters: { type: 'object', properties: {
        prompt: { type: 'string', description: 'Detailed description of the video to generate' },
        duration: { type: 'number', description: 'Duration in seconds (default 5)' }
      }, required: ['prompt'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'text_to_speech',
      description: 'Convert text into natural-sounding speech audio. Returns an audio file URL.',
      parameters: { type: 'object', properties: {
        text: { type: 'string', description: 'The text to convert to speech' },
        voice: { type: 'string', description: 'Voice style (e.g. helpful woman, friendly man)' }
      }, required: ['text'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_image',
      description: 'Analyze, describe, or extract information from an image using AI vision. Can read text, identify objects, describe scenes, solve visual problems.',
      parameters: { type: 'object', properties: {
        image_url: { type: 'string', description: 'URL of the image to analyze' },
        question: { type: 'string', description: 'What to analyze or ask about the image' }
      }, required: ['image_url', 'question'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_code',
      description: 'Execute Python code in a secure cloud sandbox. Can install packages, generate plots, process data, and return files. Use for math, data analysis, visualization, or any computation.',
      parameters: { type: 'object', properties: {
        code: { type: 'string', description: 'Python code to execute' },
        language: { type: 'string', description: 'Programming language (default: python)' }
      }, required: ['code'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deep_reason',
      description: 'Use a specialized reasoning model for complex problems requiring step-by-step logical thinking, mathematical proofs, code debugging, or multi-step analysis. Much slower but much more accurate than standard chat.',
      parameters: { type: 'object', properties: {
        problem: { type: 'string', description: 'The complex problem requiring deep reasoning' }
      }, required: ['problem'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rerank_results',
      description: 'Reorder a list of search results or documents by relevance to a query. Use after web_search to improve result quality.',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'The query to rank results against' },
        documents: { type: 'array', items: { type: 'string' }, description: 'Array of text documents to rerank' }
      }, required: ['query', 'documents'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'transcribe_audio',
      description: 'Transcribe spoken audio from a file URL into text. Supports multiple languages.',
      parameters: { type: 'object', properties: {
        audio_url: { type: 'string', description: 'URL of the audio file to transcribe' }
      }, required: ['audio_url'] }
    }
  },
  // ── LangChain / LangGraph Tools ──────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'deep_research',
      description: 'Run a multi-agent research swarm that investigates a topic from multiple perspectives in parallel, then synthesizes findings into a comprehensive report. Use for complex research questions requiring thorough analysis.',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'The research question to investigate' },
        perspectives: { type: 'number', description: 'Number of research perspectives (default: 3)' }
      }, required: ['query'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'multi_agent_plan',
      description: 'Use a supervisor-directed multi-agent team (researcher, analyst, writer) to accomplish a complex goal. The supervisor dispatches work to specialists. Use for tasks requiring multiple expert perspectives.',
      parameters: { type: 'object', properties: {
        goal: { type: 'string', description: 'The goal for the multi-agent team' },
        context: { type: 'string', description: 'Additional context or constraints' }
      }, required: ['goal'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'langchain_qa',
      description: 'Answer a question using documents and citations. Provides source-attributed answers. Use when the user provides documents or you need to answer with strict source citations.',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'The question to answer' },
        documents: { type: 'array', items: { type: 'string' }, description: 'Array of document texts to search for answers' }
      }, required: ['query', 'documents'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'semantic_search',
      description: 'Find the most semantically similar documents to a query using AI embeddings. Returns ranked results by relevance score. Use to find related content or rank document relevance.',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'The search query' },
        documents: { type: 'array', items: { type: 'string' }, description: 'Array of documents to search through' }
      }, required: ['query', 'documents'] }
    }
  },
  // ── Legal Search (OpenClaw) ──────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_legal_cases',
      description: 'Search for legal cases, court opinions, and legal documents. Use for legal research, finding case law, or understanding legal precedents.',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'Legal search query' },
        jurisdiction: { type: 'string', description: 'Court or jurisdiction filter' }
      }, required: ['query'] }
    }
  },
  // ── Maps & Location (MapBox) ─────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_location_data',
      description: 'Get geographic data, geocoding, directions, or place information. Use for location queries, address lookups, or mapping requests.',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'Location search query or address' },
        type: { type: 'string', description: 'Type: geocode, directions, places (default: geocode)' }
      }, required: ['query'] }
    }
  },
  // ── Workflow Automation (Temporal) ────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'run_workflow',
      description: 'Trigger a durable, fault-tolerant workflow. Use for long-running automations, scheduled tasks, or multi-step processes that need reliability.',
      parameters: { type: 'object', properties: {
        workflowName: { type: 'string', description: 'Name of the workflow to run' },
        input: { type: 'string', description: 'JSON string of workflow input parameters' }
      }, required: ['workflowName'] }
    }
  },
  // ── Liberty Center One ───────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'liberty_query',
      description: 'Query Liberty Center One platform services. Use for internal platform operations, tenant management, or enterprise data queries.',
      parameters: { type: 'object', properties: {
        action: { type: 'string', description: 'Action to perform: status, query, analytics' },
        params: { type: 'string', description: 'JSON string of action parameters' }
      }, required: ['action'] }
    }
  }
];

export const AgentService = {
  /**
   * Executes a tool based on the LLM's function call.
   */
  async executeTool(name, args) {
    try {
      logger.info(`[AgentService] Executing tool: ${name} with args:`, args);
      switch (name) {
        case 'execute_edge_command': {
          const res = await OpenClawService.queueEdgeCommand(args.machineId, args.command, args.payload);
          return {
            output: `Command successfully queued to edge node ${args.machineId}. Command ID: ${res.commandId}. Status: ${res.status}. Note: Execution is async, awaiting results via polling.`,
            references: [{ title: `Edge Command: ${res.commandId}`, url: 'local://openclaw', snippet: `Queued ${args.command} to ${args.machineId}`, source: 'OpenClaw Edge Fleet' }]
          };
        }
        case 'execute_code_sandbox': {
          const res = await CodexService.executeCode({ code: args.code });
          return {
            output: `Logs:\n${res.logs.join('\n')}\nReturn:\n${res.result}\nError:\n${res.error || 'None'}`,
            references: [{ title: 'Code Execution', url: 'local://open-codex', snippet: 'Sandboxed Open Codex Execution', source: 'Open Codex Sandbox' }]
          };
        }
        case 'web_search': {
          const res = await ExaSearchService.searchDirectly(args.query, { numResults: args.numResults || 3 });
          const results = res?.results || [];
          return {
            output: results.map(r => `Title: ${r.title}\nURL: ${r.url}\nSummary: ${r.summary || r.text?.slice(0, 300)}`).join('\n\n'),
            references: results.map(r => ({
              title: r.title,
              url: r.url,
              snippet: r.summary || r.text?.slice(0, 150),
              source: 'Exa Neural Search'
            }))
          };
        }
        
        
        
        
        
        
                case 'generate_image':
          console.log('Generating image with Together AI for prompt:', args.prompt);
          const imageUrl = await llmGenerateImage(args.prompt);
          
          customMetadata = {
            domain: 'image_generation',
            prompt: args.prompt,
            imageUrl: imageUrl
          };

          return {
            output: "Generated an image based on the prompt: " + args.prompt,
            references: [{ type: 'image', url: imageUrl }]
          };

        case 'search_sec_filings':
          console.log('Fetching SEC data for:', args.ticker);
          const secData = await searchSECFillings(args.ticker);
          
          let secSummary = "SEC Filings found for " + secData.title + ".";
          if (secData.recentFilings) {
            secSummary += "\nRecent forms: " + secData.recentFilings.form.slice(0, 5).join(', ');
          }

          customMetadata = {
            domain: 'sec_edgar',
            ticker: args.ticker,
            companyName: secData.title,
            cik: secData.cik,
            filings: secData.recentFilings ? secData.recentFilings.form.map((form, i) => ({
              form,
              accessionNumber: secData.recentFilings.accessionNumber[i],
              filingDate: secData.recentFilings.filingDate[i],
              primaryDocument: secData.recentFilings.primaryDocument[i]
            })).slice(0, 10) : []
          };

          return {
            output: secSummary,
            references: [{ type: 'sec', url: `https://www.sec.gov/edgar/browse/?CIK=${secData.cik}` }]
          };

        case 'get_census_data': {
          try {
            let data;
            if (args.type === 'economy') {
               data = await censusService.getEconomicData(args.year, args.state);
            } else {
               data = await censusService.getPopulationData(args.year, args.state);
            }
            
            const customMetadata = {
              domain: 'census_bps',
              censusData: data
            };

            return {
              output: `Successfully fetched Census data: ${JSON.stringify(data?.[1] || data)}. Tell the user the data will be shown in a UI widget.`,
              references: [{ title: `US Census ${args.type || 'Data'}`, url: 'https://census.gov', snippet: 'Demographic and economic data', source: 'US Census Bureau' }],
              customMetadata
            };
          } catch (error) {
            return {
              output: `Failed to search Census: ${error.message}`,
              references: []
            };
          }
        }
        case 'search_fda_drugs': {
          try {
            const data = await openfdaService.searchDrugs(args.search, { limit: 5 });
            const drugs = data?.results || [];
            
            const customMetadata = {
              domain: 'medical',
              drugs: drugs
            };

            const outputText = drugs.map(d => `Brand Name: ${d.openfda?.brand_name?.[0]}\nGeneric Name: ${d.openfda?.generic_name?.[0]}\nManufacturer: ${d.openfda?.manufacturer_name?.[0]}\nPurpose: ${d.purpose?.[0] || 'Unknown'}\nWarnings: ${d.warnings?.[0] || 'None'}`).join('\n\n') || 'No drugs found.';

            return {
              output: outputText,
              references: drugs.map(d => ({ title: d.openfda?.brand_name?.[0] || 'Drug Label', url: 'https://open.fda.gov', snippet: d.purpose?.[0]?.slice(0,100), source: 'OpenFDA' })),
              customMetadata
            };
          } catch (error) {
            return {
              output: `Failed to search OpenFDA: ${error.message}`,
              references: []
            };
          }
        }
        case 'get_legislative_bills': {
          try {
            let data;
            if (args.congress && args.billType && args.billNumber) {
               data = await congressService.getBill(args.congress, args.billType, args.billNumber);
            } else {
               data = await congressService.getRecentBills({ limit: 10 });
            }
            
            const bills = data?.bills || (data?.bill ? [data.bill] : []);
            
            const customMetadata = {
              domain: 'legal',
              legislation: bills
            };

            const outputText = bills.map(b => `Bill: ${b.type}${b.number} (${b.congress} Congress)\nTitle: ${b.title}\nLatest Action: ${b.latestAction?.text} (${b.latestAction?.actionDate})\nURL: ${b.url}`).join('\n\n') || 'No bills found.';

            return {
              output: outputText,
              references: bills.map(b => ({ title: `${b.type}${b.number} (${b.congress})`, url: b.url, snippet: b.title, source: 'Congress.gov' })),
              customMetadata
            };
          } catch (error) {
            return {
              output: `Failed to search Congress API: ${error.message}`,
              references: []
            };
          }
        }
        case 'search_academic_papers': {
          try {
            const data = await arxivService.searchPapers(args.query, { max_results: args.max_results || 5 });
            
            // extract the feed entries
            let entries = data?.feed?.entry || [];
            if (!Array.isArray(entries)) entries = [entries];
            
            const results = entries.map(e => ({
              title: e.title?.replace(/\s+/g, ' ').trim(),
              summary: e.summary?.replace(/\s+/g, ' ').trim(),
              authors: Array.isArray(e.author) ? e.author.map(a => a.name).join(', ') : e.author?.name || 'Unknown',
              published: e.published,
              url: e.id
            }));

            const customMetadata = {
              domain: 'academic',
              papers: results
            };

            const outputText = results.map(r => `Title: ${r.title}\nAuthors: ${r.authors}\nPublished: ${r.published}\nSummary: ${r.summary}\nURL: ${r.url}`).join('\n\n') || 'No papers found.';

            return {
              output: outputText,
              references: results.map(r => ({ title: r.title.slice(0, 50) + '...', url: r.url, snippet: r.summary.slice(0, 150), source: 'arXiv' })),
              customMetadata
            };
          } catch (error) {
            return {
              output: `Failed to search arXiv: ${error.message}`,
              references: []
            };
          }
        }
        case 'get_economic_data': {
          try {
            const seriesInfo = await fredService.getSeriesInfo(args.series_id);
            const obsInfo = await fredService.getSeriesObservations(args.series_id, { limit: 12, sort_order: 'desc' });
            
            const info = seriesInfo?.seriess?.[0] || {};
            const obs = obsInfo?.observations || [];
            
            const customMetadata = {
              domain: 'finance',
              financialTicker: args.series_id,
              fredData: {
                title: info.title,
                frequency: info.frequency,
                units: info.units,
                recentObservations: obs
              }
            };

            return {
              output: `Successfully fetched FRED data for ${args.series_id} (${info.title || 'Unknown Series'}). Recent value: ${obs[0]?.value || 'N/A'}. The data will be displayed in a custom UI widget.`,
              references: [{ title: `FRED: ${info.title || args.series_id}`, url: `https://fred.stlouisfed.org/series/${args.series_id}`, snippet: 'Federal Reserve Economic Data', source: 'FRED' }],
              customMetadata
            };
          } catch (error) {
            return {
              output: `Failed to fetch FRED data: ${error.message}`,
              references: []
            };
          }
        }
        case 'get_real_estate_property': {
          // Fallback parsing just in case
          const address = args.address;
          try {
            // First run PropertyDetail
            const detailRes = await realEstateApiService.getPropertyDetail({ address });
            
            // Try to get comps
            const compsRes = await realEstateApiService.getPropertyComps({ address }).catch(() => null);

            const detail = detailRes?.data?.[0] || {};
            const comps = compsRes?.data || [];
            
            // Build the frontend UI metadata
            const customMetadata = {
              domain: 'real_estate',
              address: address,
              valuation: detail.avm?.amount || detail.assessedValue || 'N/A',
              lowRange: detail.avm?.low || 'N/A',
              highRange: detail.avm?.high || 'N/A',
              comps: comps.slice(0, 5).map(c => ({
                address: c.address,
                price: c.price || c.assessedValue || 'N/A',
                date: c.saleDate || 'N/A',
                size: c.squareFeet ? `${c.squareFeet} sqft` : 'N/A'
              }))
            };

            return {
              output: `Successfully fetched real estate data for ${address}. Valuation: ${customMetadata.valuation}. The data will be displayed in a custom Real Estate UI widget. Tell the user you have displayed the property details.`,
              references: [{ title: `Real Estate Data: ${address}`, url: 'https://realestateapi.com', snippet: 'Property details and AVM', source: 'RealEstateAPI' }],
              customMetadata
            };
          } catch (error) {
            return {
              output: `Failed to fetch real estate data: ${error.message}`,
              references: []
            };
          }
        }
        case 'trigger_app_action': {
          const res = await ComposioService.executeTool(args.tool_slug, args.params, 'system-session');
          return { output: JSON.stringify(res), references: [] };
        }
        case 'get_weather': {
          const wx = await VisualCrossingService.getForecast(args.location);
          return {
            output: JSON.stringify({ current: wx?.currentConditions, days: wx?.days?.slice(0, 3) }),
            references: [{ title: `Weather for ${args.location}`, url: 'https://visualcrossing.com', snippet: 'Live weather data', source: 'Visual Crossing' }]
          };
        }
        case 'get_flights': {
          const flight = await AviationStackService.getFlightByNumber(args.flight_number);
          return {
            output: JSON.stringify(flight),
            references: [{ title: `Flight ${args.flight_number}`, url: 'https://aviationstack.com', snippet: 'Live flight tracking', source: 'AviationStack' }]
          };
        }
        case 'research_company': {
          const res = await ExploriumService.researchBusiness({ query: args.company_name });
          return {
            output: JSON.stringify(res),
            references: [{ title: `${args.company_name} Intelligence`, url: 'https://explorium.ai', snippet: 'B2B Firmographics', source: 'Explorium AgentSource' }]
          };
        }
        case 'get_crypto_price': {
          const res = await CoinApiService.getExchangeRate(args.base_asset, args.quote_asset);
          return {
            output: JSON.stringify(res),
            references: [{ title: `${args.base_asset}/${args.quote_asset} Rate`, url: 'https://coinapi.io', snippet: 'Live Crypto Price', source: 'CoinAPI' }],
            customMetadata: { financialTicker: args.base_asset, currentPrice: res.rate || res.price }
          };
        }
        case 'get_stock_aggregates': {
          const res = await MassiveService.getStockAggregates(args.ticker, args.multiplier, args.timespan, args.from, args.to);
          return {
            output: JSON.stringify(res),
            references: [{ title: `${args.ticker} Stock Data`, url: 'https://massive.com', snippet: 'Live Market Data', source: 'Massive' }],
            customMetadata: { financialTicker: args.ticker, stockData: res }
          };
        }
        case 'get_sports_fixtures': {
          const res = await ApiSportsService.getFixtures({ date: args.date });
          return {
            output: JSON.stringify(res),
            references: [{ title: `Sports Fixtures ${args.date}`, url: 'https://api-sports.io', snippet: 'Live Sports Scores', source: 'API-Sports' }]
          };
        }
        case 'get_prediction_markets': {
          const res = await PredictionDataService.searchMarkets(args.query);
          return {
            output: JSON.stringify(res),
            references: [{ title: `Prediction Markets for ${args.query}`, url: 'https://polymarket.com', snippet: 'Live Odds', source: 'PredictionData' }]
          };
        }
        case 'get_latest_news': {
          const res = await NewsApiService.getTopHeadlines({ q: args.q });
          return {
            output: JSON.stringify(res),
            references: [{ title: `News: ${args.q}`, url: 'https://newsapi.ai', snippet: 'Breaking News', source: 'NewsAPI' }]
          };
        }

        // ─── NEW TOGETHER AI TOOL HANDLERS ──────────────────────────────
        
        case 'edit_image': {
          try {
            let resultUrl;
            if (args.source_image_url) {
              resultUrl = await llmImageToImage(args.prompt, args.source_image_url);
            } else {
              resultUrl = await llmGenerateImage(args.prompt);
            }
            
            const customMetadata = {
              domain: 'image_generation',
              prompt: args.prompt,
              imageUrl: resultUrl,
              isEdit: !!args.source_image_url,
              sourceImageUrl: args.source_image_url || null
            };

            return {
              output: `Image ${args.source_image_url ? 'edited' : 'generated'} successfully for prompt: "${args.prompt}"`,
              references: [{ type: 'image', url: resultUrl }],
              customMetadata
            };
          } catch (error) {
            return { output: `Image generation failed: ${error.message}`, references: [] };
          }
        }

        case 'generate_video': {
          try {
            const videoResult = await llmGenerateVideo(args.prompt, {
              seconds: args.duration || 5
            });

            const customMetadata = {
              domain: 'video_generation',
              prompt: args.prompt,
              videoUrl: videoResult?.url || videoResult?.output?.url || null,
              videoId: videoResult?.id || null,
              status: videoResult?.status || 'processing'
            };

            return {
              output: `Video generation initiated for: "${args.prompt}". ${videoResult?.id ? 'Video ID: ' + videoResult.id : 'Processing...'}`,
              references: [{ title: 'AI Video', url: customMetadata.videoUrl || 'pending', snippet: args.prompt, source: 'Together AI Video' }],
              customMetadata
            };
          } catch (error) {
            return { output: `Video generation failed: ${error.message}`, references: [] };
          }
        }

        case 'text_to_speech': {
          try {
            const audioResult = await llmTextToSpeech(args.text, {
              voice: args.voice || 'helpful woman'
            });

            // The SDK returns an ArrayBuffer — we need to convert to a data URL or store it
            let audioUrl = null;
            if (audioResult) {
              const buffer = Buffer.from(await audioResult.arrayBuffer());
              audioUrl = `data:audio/mpeg;base64,${buffer.toString('base64')}`;
            }

            const customMetadata = {
              domain: 'audio_generation',
              text: args.text,
              voice: args.voice || 'helpful woman',
              audioUrl
            };

            return {
              output: `Generated speech audio for: "${args.text.slice(0, 100)}${args.text.length > 100 ? '...' : ''}"`,
              references: [{ title: 'Text-to-Speech', url: 'together-ai-tts', snippet: args.text.slice(0, 150), source: 'Together AI TTS' }],
              customMetadata
            };
          } catch (error) {
            return { output: `Text-to-speech failed: ${error.message}`, references: [] };
          }
        }

        case 'analyze_image': {
          try {
            const visionResult = await llmVisionChat(args.question, args.image_url);
            const analysis = visionResult.choices?.[0]?.message?.content || 'No analysis available.';

            const customMetadata = {
              domain: 'vision_analysis',
              imageUrl: args.image_url,
              question: args.question,
              analysis
            };

            return {
              output: analysis,
              references: [{ title: 'Image Analysis', url: args.image_url, snippet: analysis.slice(0, 150), source: 'Together AI Vision' }],
              customMetadata
            };
          } catch (error) {
            return { output: `Image analysis failed: ${error.message}`, references: [] };
          }
        }

        case 'run_code': {
          try {
            const codeResult = await llmCodeInterpreter(args.code, {
              language: args.language || 'python'
            });

            const customMetadata = {
              domain: 'code_result',
              code: args.code,
              language: args.language || 'python',
              output: codeResult?.output || codeResult?.result || '',
              error: codeResult?.error || null,
              files: codeResult?.files || []
            };

            const outputText = codeResult?.output || codeResult?.result || 'Code executed successfully.';
            const errorText = codeResult?.error ? `\nError: ${codeResult.error}` : '';

            return {
              output: `Code execution result:\n${outputText}${errorText}`,
              references: [{ title: 'Code Execution', url: 'together-ai-code', snippet: `Python sandbox execution`, source: 'Together AI Code Interpreter' }],
              customMetadata
            };
          } catch (error) {
            return { output: `Code execution failed: ${error.message}`, references: [] };
          }
        }

        case 'deep_reason': {
          try {
            const reasonResult = await llmReasoningChat([
              { role: 'user', content: args.problem }
            ], { maxTokens: 16384 });
            
            const reasoning = reasonResult.choices?.[0]?.message?.content || 'No reasoning output.';

            return {
              output: reasoning,
              references: [{ title: 'Deep Reasoning', url: 'together-ai-reasoning', snippet: args.problem.slice(0, 150), source: 'Together AI Reasoning (QwQ-32B)' }]
            };
          } catch (error) {
            return { output: `Reasoning failed: ${error.message}`, references: [] };
          }
        }

        case 'rerank_results': {
          try {
            const rerankResult = await llmRerank(args.query, args.documents);
            const ranked = rerankResult?.results || [];
            const outputText = ranked.map((r, i) => 
              `${i + 1}. [Score: ${r.relevance_score?.toFixed(4)}] ${r.document?.text?.slice(0, 200) || args.documents[r.index]?.slice(0, 200)}`
            ).join('\n');

            return {
              output: `Reranked ${ranked.length} results for "${args.query}":\n${outputText}`,
              references: []
            };
          } catch (error) {
            return { output: `Reranking failed: ${error.message}`, references: [] };
          }
        }

        case 'transcribe_audio': {
          try {
            const transcription = await llmTranscribeAudio(args.audio_url);
            const text = transcription?.text || transcription || 'No transcription available.';

            return {
              output: `Transcription: ${text}`,
              references: [{ title: 'Audio Transcription', url: args.audio_url, snippet: String(text).slice(0, 150), source: 'Together AI Whisper' }]
            };
          } catch (error) {
            return { output: `Transcription failed: ${error.message}`, references: [] };
          }
        }

        // ── LangGraph: Deep Research Swarm ──────────────────────────────────
        case 'deep_research': {
          try {
            const result = await LangGraphService.runResearchSwarm({
              query: args.query,
              perspectives: args.perspectives || 3,
            });
            customMetadata = { domain: 'deep_research', query: args.query, perspectives: result.perspectives?.length || 0 };
            return {
              output: `Research Synthesis:\n${result.synthesis}\n\nPerspectives Investigated: ${result.perspectives?.length || 0}`,
              references: (result.perspectives || []).map(p => ({
                title: p.angle,
                url: 'local://langgraph-swarm',
                snippet: (p.findings || '').slice(0, 200),
                source: 'LangGraph Research Swarm'
              }))
            };
          } catch (error) {
            return { output: `Deep research failed: ${error.message}`, references: [] };
          }
        }

        // ── LangGraph: Supervisor Multi-Agent ───────────────────────────────
        case 'multi_agent_plan': {
          try {
            const result = await LangGraphService.runSupervisorGraph({
              goal: args.goal,
              context: args.context || '',
            });
            customMetadata = { domain: 'multi_agent', goal: args.goal };
            return {
              output: `Multi-Agent Results:\n${Object.entries(result.results || {}).map(([agent, output]) => `[${agent}]: ${output}`).join('\n\n')}`,
              references: Object.entries(result.results || {}).map(([agent, output]) => ({
                title: `Agent: ${agent}`,
                url: 'local://langgraph-supervisor',
                snippet: String(output).slice(0, 200),
                source: 'LangGraph Supervisor'
              }))
            };
          } catch (error) {
            return { output: `Multi-agent plan failed: ${error.message}`, references: [] };
          }
        }

        // ── LangChain: QA with Citations ────────────────────────────────────
        case 'langchain_qa': {
          try {
            const result = await LangChainService.runQAChain({
              query: args.query,
              documents: args.documents || [],
            });
            return {
              output: result.answer,
              references: [{ title: 'QA Chain Result', url: 'local://langchain', snippet: result.answer.slice(0, 200), source: 'LangChain QA Chain' }]
            };
          } catch (error) {
            return { output: `QA chain failed: ${error.message}`, references: [] };
          }
        }

        // ── LangChain: Semantic Similarity Search ───────────────────────────
        case 'semantic_search': {
          try {
            const result = await CommunityIntegrationsService.semanticSimilarity({
              query: args.query,
              documents: args.documents || [],
            });
            const topResults = (result.results || []).slice(0, 5);
            return {
              output: `Semantic Search Results (ranked by relevance):\n${topResults.map((r, i) => `${i + 1}. [Score: ${r.score?.toFixed(3)}] ${r.document}`).join('\n')}`,
              references: topResults.map(r => ({
                title: `Relevance: ${r.score?.toFixed(3)}`,
                url: 'local://langchain-embeddings',
                snippet: r.document.slice(0, 150),
                source: 'LangChain Semantic Search'
              }))
            };
          } catch (error) {
            return { output: `Semantic search failed: ${error.message}`, references: [] };
          }
        }

        // ── OpenClaw: Legal Case Search ─────────────────────────────────────
        case 'search_legal_cases': {
          try {
            const result = await OpenClawService.searchCases(args.query, { jurisdiction: args.jurisdiction });
            const cases = result?.results || result || [];
            customMetadata = { domain: 'openclaw_legal', query: args.query, cases: Array.isArray(cases) ? cases.slice(0, 10) : [] };
            return {
              output: Array.isArray(cases)
                ? cases.slice(0, 5).map(c => `Case: ${c.caseName || c.name || 'Unknown'}\nCourt: ${c.court || 'N/A'}\nDate: ${c.dateFiled || c.date || 'N/A'}\nSummary: ${c.snippet || c.summary || 'N/A'}`).join('\n\n')
                : JSON.stringify(cases).slice(0, 2000),
              references: (Array.isArray(cases) ? cases.slice(0, 5) : []).map(c => ({
                title: c.caseName || c.name || 'Legal Case',
                url: c.url || 'local://openclaw',
                snippet: c.snippet || c.summary || '',
                source: 'OpenClaw Legal Search'
              }))
            };
          } catch (error) {
            return { output: `Legal search failed: ${error.message}`, references: [] };
          }
        }

        // ── MapBox: Location / Geocoding ────────────────────────────────────
        case 'get_location_data': {
          try {
            const type = args.type || 'geocode';
            let result;
            if (type === 'geocode') {
              result = await MapboxService.geocode(args.query);
            } else if (type === 'directions') {
              result = await MapboxService.getDirections(args.query);
            } else {
              result = await MapboxService.searchPlaces(args.query);
            }
            const data = result?.features || result?.results || result || [];
            customMetadata = { domain: 'mapbox_location', type, query: args.query, data: Array.isArray(data) ? data.slice(0, 5) : [] };
            return {
              output: Array.isArray(data)
                ? data.slice(0, 5).map(f => `📍 ${f.place_name || f.text || f.name || JSON.stringify(f).slice(0, 200)}`).join('\n')
                : JSON.stringify(data).slice(0, 2000),
              references: [{ title: `Location: ${args.query}`, url: 'local://mapbox', snippet: `${type} results for ${args.query}`, source: 'MapBox' }]
            };
          } catch (error) {
            return { output: `Location lookup failed: ${error.message}`, references: [] };
          }
        }

        // ── Temporal: Workflow Automation ────────────────────────────────────
        case 'run_workflow': {
          try {
            let input = {};
            try { input = JSON.parse(args.input || '{}'); } catch { input = { raw: args.input }; }
            const result = await TemporalService.startWorkflow(args.workflowName, input);
            customMetadata = { domain: 'temporal_workflow', workflowName: args.workflowName, runId: result?.runId || result?.workflowId || 'pending', status: result?.status || 'running' };
            return {
              output: `Workflow "${args.workflowName}" started successfully.\nRun ID: ${result?.runId || result?.workflowId || 'pending'}\nStatus: ${result?.status || 'running'}`,
              references: [{ title: `Workflow: ${args.workflowName}`, url: 'local://temporal', snippet: `Run ID: ${result?.runId || 'N/A'}`, source: 'Temporal Workflow' }]
            };
          } catch (error) {
            return { output: `Workflow failed: ${error.message}`, references: [] };
          }
        }

        // ── Liberty Center One ──────────────────────────────────────────────
        case 'liberty_query': {
          try {
            let params = {};
            try { params = JSON.parse(args.params || '{}'); } catch { params = { raw: args.params }; }
            const result = await LibertyService.query(args.action, params);
            customMetadata = { domain: 'liberty_platform', action: args.action, result: result };
            return {
              output: typeof result === 'string' ? result : JSON.stringify(result, null, 2).slice(0, 3000),
              references: [{ title: `Liberty: ${args.action}`, url: 'local://liberty', snippet: `Action: ${args.action}`, source: 'Liberty Center One' }]
            };
          } catch (error) {
            return { output: `Liberty query failed: ${error.message}`, references: [] };
          }
        }

        default:
          return { output: `Error: Tool ${name} not recognized.`, references: [] };
      }
    } catch (error) {
      logger.error(`[AgentService] Tool ${name} failed: ${error.message}`);
      return { output: `Tool execution failed: ${error.message}`, references: [] };
    }
  },

  /**
   * Runs the autonomous Agentic ReAct loop.
   * Yields metadata and text chunks for the SSE stream.
   * @param {Array} initialMessages - Conversation history
   * @param {Object} options - Model config
   * @returns {AsyncGenerator} 
   */
  async *runAgentStream(initialMessages, options = {}) {
    const messages = [...initialMessages];
    const maxLoops = 8;
    let loopCount = 0;
    const allReferences = [];

    while (loopCount < maxLoops) {
      loopCount++;
      logger.info(`[AgentService] Starting loop ${loopCount}...`);
      
      // Call LLM
      const response = await llmToolCall(messages, tools, options);
      const responseMessage = response.choices[0]?.message;

      if (!responseMessage) {
        yield { type: 'text', content: '\n\n*Error: LLM returned empty response.*' };
        break;
      }

      // If there are tool calls, execute them
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        messages.push(responseMessage); // append assistant's tool calls
        
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          let functionArgs;
          try {
            functionArgs = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            functionArgs = {};
          }

          // Let the frontend know what tool we're running
          yield { type: 'metadata', status: `running ${functionName.replace(/_/g, ' ')}...` };

          const { output, references, customMetadata } = await this.executeTool(functionName, functionArgs);
          
          if (customMetadata) {
             // Yield custom metadata to trigger Generative UI
             yield { type: 'metadata', ...customMetadata };
          }
          
          if (references && references.length > 0) {
            allReferences.push(...references);
            // Yield metadata to frontend immediately so citations show up as they are found
            yield { type: 'metadata', references: allReferences };
          }

          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: output || 'Success'
          });
        }
      } else {
        // No tool calls means the agent is ready to stream the final answer.
        // We will discard the text it just generated and re-run as a stream for UI UX.
        // Or we can just yield the text if we don't care about streaming character-by-character.
        // But users love the typewriter effect. We'll run llmStream to generate the final response.
        
        logger.info(`[AgentService] Loop finished, streaming final answer...`);
        const stream = await llmStream(messages, options);
        for await (const chunk of stream) {
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) {
            yield { type: 'text', content: text };
          }
        }
        break;
      }
    }

    if (loopCount >= maxLoops) {
      yield { type: 'text', content: '\n\n*Error: Agent reached maximum recursion depth.*' };
    }
  },

  /**
   * Main ReAct Agent Loop (Non-Streaming/JSON Mode)
   */
  async runAgentJson(initialMessages, options = {}) {
    const maxSteps = options.maxSteps || 8;
    const model = options.model || 'gpt-oss-120b';
    const temperature = options.temperature || 0.1;
    let messages = [...initialMessages];
    let stepCount = 0;
    const allReferences = [];

    try {
      while (stepCount < maxSteps) {
        stepCount++;
        const response = await llmToolCall(messages, tools, { model, temperature });
        const toolCalls = response.choices?.[0]?.message?.tool_calls;
        
        if (!toolCalls || toolCalls.length === 0) break;

        const messageWithTools = response.choices[0].message;
        messages.push(messageWithTools);

        for (const toolCall of toolCalls) {
          const name = toolCall.function.name;
          let functionArgs = {};
          try {
            functionArgs = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            // Ignore JSON parse errors
          }

          const result = await this.executeTool(name, functionArgs);
          
          if (result.references?.length > 0) {
            allReferences.push(...result.references);
          }

          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: name,
            content: result.output,
          });
        }
      }

      // Final generation (non-streaming)
      const finalRes = await llmToolCall(messages, undefined, { model, temperature });
      return {
        reply: finalRes.choices?.[0]?.message?.content || '',
        references: allReferences,
        steps: stepCount
      };
    } catch (err) {
      logger.error(`[AgentService] Fatal error: ${err.message}`);
      throw err;
    }
  }
};

export default AgentService;
