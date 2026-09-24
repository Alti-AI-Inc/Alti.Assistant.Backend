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
import { recordToolUsage } from './toolUsage.model.js';

// Define schemas for the LLM
const tools = [
  {
    type: "function",
    function: {
      name: "dspy_compile_task",
      description: "Use the DSPy Prompt Compiler to automatically optimize and execute a highly complex reasoning task. Use this instead of standard reasoning when maximum accuracy is required.",
      parameters: { type: "object", properties: { taskDescription: { type: "string" }, inputs: { type: "object" } }, required: ["taskDescription", "inputs"] }
    }
  },
  {
    type: "function",
    function: {
      name: "crawl_website",
      description: "Use the Aphura supersonic crawler (Crawl4AI) to rip an entire website, documentation, or sitemap and return the clean markdown instantly.",
      parameters: { type: "object", properties: { url: { type: "string" }, depth: { type: "number" } }, required: ["url"] }
    }
  },
  {
    type: "function",
    function: {
      name: "query_knowledge_graph",
      description: "Query the Aphura Knowledge Graph (GraphRAG) to synthesize global context and find deep entity relationships across massive amounts of documents.",
      parameters: { type: "object", properties: { query: { type: "string" }, graphId: { type: "string" } }, required: ["query", "graphId"] }
    }
  },
  {
    type: "function",
    function: {
      name: "spawn_agent_swarm",
      description: "Spawn a hive-mind of specialized sub-agents (e.g. Researcher, QA, Developer) to collaboratively solve a massive objective.",
      parameters: { type: "object", properties: { objective: { type: "string" }, teamConfig: { type: "array", items: { type: "string" } } }, required: ["objective", "teamConfig"] }
    }
  },
  {
    type: "function",
    function: {
      name: "parse_desktop_screen",
      description: "Use the Aphura OmniParser engine to analyze a screenshot of the user OS. Returns exact XY coordinates of all clickable icons, buttons, and text fields on the screen.",
      parameters: { type: "object", properties: { base64Image: { type: "string" } }, required: ["base64Image"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_python_code",
      description: "Write and execute Python code in a sandboxed Jupyter kernel to perform advanced data analysis, crunch math, or generate visual charts.",
      parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] }
    }
  },
  {
    type: "function",
    function: {
      name: "process_complex_document",
      description: "Process a complex PDF, financial report, or scientific document using the Aphura Docling Engine to extract perfect tables and layout prior to RAG analysis.",
      parameters: { type: "object", properties: { filePath: { type: "string" }, collectionId: { type: "string" } }, required: ["filePath", "collectionId"] }
    }
  },
  {
    type: "function",
    function: {
      name: "swe_execute_command",
      description: "Execute a bash command in the Aphura Autonomous Engineering sandbox. Use this to run tests, grep for files, or compile code.",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] }
    }
  },
  {
    type: "function",
    function: {
      name: "swe_edit_file",
      description: "Edit a file natively in the Aphura sandbox by replacing an exact string.",
      parameters: { type: "object", properties: { targetFile: { type: "string" }, searchString: { type: "string" }, replacementString: { type: "string" } }, required: ["targetFile", "searchString", "replacementString"] }
    }
  },
  {
    type: "function",
    function: {
      name: "swe_view_file",
      description: "Read the contents of a file in the Aphura sandbox using line numbers to avoid context limits.",
      parameters: { type: "object", properties: { targetFile: { type: "string" }, startLine: { type: "number" }, endLine: { type: "number" } }, required: ["targetFile"] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_cloud_ide",
      description: "Provision a full OpenVSCode Server cloud IDE instance for the user. Use this when the user wants to work on a large software project collaboratively.",
      parameters: { type: "object", properties: { workspaceName: { type: "string" } }, required: ["workspaceName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_saas_action",
      description: "Use the Aphura Workflow Engine (Activepieces) to execute an action on any enterprise SaaS platform (e.g. Salesforce, Google Drive, Slack, HubSpot).",
      parameters: { type: "object", properties: { appName: { type: "string" }, actionName: { type: "string" }, payload: { type: "object" } }, required: ["appName", "actionName", "payload"] }
    }
  },
  {
    type: "function",
    function: {
      name: "delegate_to_aphura_sovereign_agent",
      description: "Delegate complex, multi-step autonomous reasoning to the Aphura Sovereign Agent (Cleaned Hermes Engine).",
      parameters: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_legal_contract",
      description: "Pass legal documents and contracts to the Aphura Compliance Engine (Cleaned OpenClaw) for deep liability analysis.",
      parameters: { type: "object", properties: { contract_text: { type: "string" } }, required: ["contract_text"] }
    }
  },
  {
    type: "function",
    function: {
      name: "browser_use_action",
      description: "Use the ultrafast Browser-Use framework to physically control a headless browser. Use this to scrape modern web apps, click buttons, or extract dynamic data that simple GET requests cannot handle.",
      parameters: { type: "object", properties: { action: { type: "string", enum: ["launch", "click", "type", "scroll", "close"] }, url_or_target: { type: "string" }, sessionId: { type: "string" } }, required: ["action", "url_or_target", "sessionId"] }
    }
  },
  {
    type: "function",
    function: {
      name: "query_knowledgebase",
      description: "Perform a semantic RAG vector search against the user's massive private document database (Enterprise Memory). Use this when the user asks about their own PDFs, codebases, or uploaded files.",
      parameters: { type: "object", properties: { query: { type: "string" }, collectionId: { type: "string" } }, required: ["query"] }
    }
  },
      {
        type: "function",
        function: {
          name: "get_noaa_weather",
          description: "Fetch live official weather radar, forecast, and atmospheric observations directly from the National Oceanic and Atmospheric Administration (NOAA / NWS).",
          parameters: {
            type: "object",
            properties: {
              latitude: { type: "number", description: "Latitude coordinate (e.g. 40.7128)" },
              longitude: { type: "number", description: "Longitude coordinate (e.g. -74.0060)" }
            },
            required: ["latitude", "longitude"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_nih_pubmed",
          description: "Search 36M+ peer-reviewed clinical trials, biomedical research papers, and medical journals directly on NIH PubMed (NCBI).",
          parameters: {
            type: "object",
            properties: {
              term: { type: "string", description: "Medical term, disease, drug, clinical trial or genomic target" },
              retmax: { type: "number", description: "Max results to return (default 5)" }
            },
            required: ["term"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_un_trade_data",
          description: "Fetch official bilateral trade, commodity export/import flows, and tariff statistics directly from United Nations (UN) Comtrade.",
          parameters: {
            type: "object",
            properties: {
              reporterCode: { type: "string", description: "Reporter country ISO or numeric code (e.g. '842' for USA)" },
              partnerCode: { type: "string", description: "Partner country code (default '0' for World)" }
            },
            required: ["reporterCode"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_uspto_patents",
          description: "Search intellectual property, technology patent grants, and claims directly from the U.S. Patent and Trademark Office (USPTO).",
          parameters: {
            type: "object",
            properties: {
              keyword: { type: "string", description: "Technology keyword, inventor, or patent title" }
            },
            required: ["keyword"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_openalex_papers",
          description: "Search global scientific literature, citations, authors, and open-access research directly from the OpenAlex scholarly knowledge graph.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Research query, topic, or scientific theorem" }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_nasa_data",
          description: "Fetch NASA space data including APOD, Mars Rovers, or Near Earth Objects.",
          parameters: {
            type: "object",
            properties: {
              dataset: { type: "string", description: "apod, mars, or neo" }
            },
            required: ["dataset"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_world_bank_data",
          description: "Fetch global economic and demographic indicators from the World Bank.",
          parameters: {
            type: "object",
            properties: {
              indicator: { type: "string", description: "e.g., SP.POP.TOTL for population" },
              country_code: { type: "string", description: "2-letter ISO code" }
            },
            required: ["indicator", "country_code"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_usgs_earthquakes",
          description: "Fetch recent earthquake data globally from the USGS.",
          parameters: {
            type: "object",
            properties: {
              min_magnitude: { type: "number", description: "Minimum earthquake magnitude (e.g., 4.5)" }
            },
            required: ["min_magnitude"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_usda_agriculture",
          description: "Fetch agricultural and food data from the USDA.",
          parameters: {
            type: "object",
            properties: {
              commodity: { type: "string", description: "e.g., CORN, WHEAT, SOYBEANS" }
            },
            required: ["commodity"]
          }
        }
      },  {
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
      name: 'desktop_computer_use',
      description: 'Executes an action directly on the user\'s local Desktop/Mobile device via Aphura WebSocket Bridge (MCP Local Code/Mouse/File manipulation).',
      parameters: { type: 'object', properties: { action: { type: 'string' }, payload: { type: 'object' } }, required: ['action', 'payload'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cloud_code_interpreter',
      description: 'Executes Python or Node.js code securely in a Aphura air-gapped Zun container. Use this for heavy data analysis, math, or backend scripting when the user is on Mobile/Web.',
      parameters: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string', enum: ['python', 'node'] } }, required: ['code'] }
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
  // ── Aphura ───────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'liberty_query',
      description: 'Query Aphura platform services. Use for internal platform operations, tenant management, or enterprise data queries.',
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
  async executeTool(name, args, userId) {
    let customMetadata = null;
    const startTime = Date.now();
    try {
      logger.info(`[AgentService] Executing tool: ${name} with args:`, args);
      const executeInternal = async () => {
        switch (name) {
        case "dspy_compile_task": {
          try {
            const { DSPyService } = await import("./dspy.service.js");
            const res = await DSPyService.compileAndRun(args.taskDescription, args.inputs);
            return { output: `### DSPy Optimized Result\\n\\n${res}` };
          } catch (err) {
            return { output: `DSPy compilation failed: ${err.message}` };
          }
        }        case "crawl_website": {
          try {
            const { CrawlerService } = await import("../browser/crawler.service.js");
            const res = await CrawlerService.crawlWebsite(args.url, args.depth || 1);
            return { output: `### Crawl Result\\n\\n${res.markdown}` };
          } catch (err) {
            return { output: `Crawl failed: ${err.message}` };
          }
        }        case "query_knowledge_graph": {
          try {
            const { GraphRAGService } = await import("../rag/graphrag.service.js");
            const res = await GraphRAGService.queryGraph(args.query, args.graphId);
            return { output: `### Knowledge Graph Synthesis\\n\\n${res.answer}` };
          } catch (err) {
            return { output: `GraphRAG failed: ${err.message}` };
          }
        }        case "spawn_agent_swarm": {
          try {
            const { CrewAIService } = await import("../agents/crewai.service.js");
            const res = await CrewAIService.executeSwarmTask(args.objective, args.teamConfig);
            return { output: `### Hive-Mind Consensus Reached\\n\\n```text\\n${res.finalConsensus}\\n```` };
          } catch (err) {
            return { output: `Hive-Mind failed: ${err.message}` };
          }
        }        case "parse_desktop_screen": {
          try {
            const { OmniParserService } = await import("../vision/omniparser.service.js");
            const res = await OmniParserService.parseScreen(args.base64Image);
            const formatted = OmniParserService.formatForAgent(res.elements);
            return { output: `### OmniParser Vision Analysis\\n\\nDetected the following interactive elements on the screen:\\n```text\\n${formatted}\\n```\\n\\nYou can now use the Desktop Bridge to click any of these coordinates.` };
          } catch (err) {
            return { output: `OmniParser failed: ${err.message}` };
          }
        }        case "execute_python_code": {
          try {
            const { JupyterService } = await import("../compute/jupyter.service.js");
            const res = await JupyterService.executeCode(args.code);
            return { output: `### Python Execution Result\\n\\n```text\\n${res.stdout}\\n```` };
          } catch (err) {
            return { output: `Python execution failed: ${err.message}` };
          }
        }        case "process_complex_document": {
          try {
            const { DoclingService } = await import("../rag/docling.service.js");
            const parseRes = await DoclingService.parseDocument(args.filePath);
            await DoclingService.ingestToVectorDB(args.collectionId, parseRes.content);
            return { output: `Document successfully processed and vectorized into ${args.collectionId}. Extracted ${parseRes.tablesExtracted} tables.` };
          } catch (err) {
            return { output: `Document processing failed: ${err.message}` };
          }
        }        case "swe_execute_command": {
          try {
            const { SWEService } = await import("../agents/swe.service.js");
            const res = await SWEService.executeCommand(args.command);
            return { output: `Execution Result:\\n${res.output}` };
          } catch (err) {
            return { output: `Command failed: ${err.message}` };
          }
        }
        case "swe_edit_file": {
          try {
            const { SWEService } = await import("../agents/swe.service.js");
            const res = await SWEService.editFile(args.targetFile, args.searchString, args.replacementString);
            return { output: `Edit Result:\\n${res.output}` };
          } catch (err) {
            return { output: `Edit failed: ${err.message}` };
          }
        }
        case "swe_view_file": {
          try {
            const { SWEService } = await import("../agents/swe.service.js");
            const res = await SWEService.viewFile(args.targetFile, args.startLine, args.endLine);
            return { output: `File Contents (Lines ${args.startLine || 1}-${args.endLine || 100}):\\n${res.output}` };
          } catch (err) {
            return { output: `View failed: ${err.message}` };
          }
        }        case "provision_cloud_ide": {
          try {
            const { VSCodeService } = await import("../ide/vscode.service.js");
            const res = await VSCodeService.provisionWorkspace("admin_user", args.workspaceName);
            return { output: `Cloud IDE Provisioned:\nURL: ${res.url}` };
          } catch (err) {
            return { output: `IDE provisioning failed: ${err.message}` };
          }
        }        case "execute_saas_action": {
          try {
            const { ActivepiecesService } = await import("../workflows/activepieces.service.js");
            const res = await ActivepiecesService.executeSaaSAction(args.appName, args.actionName, args.payload);
            return { output: `SaaS Action Successful:\n${JSON.stringify(res.data)}` };
          } catch (err) {
            return { output: `SaaS Action failed: ${err.message}` };
          }
        }        case "delegate_to_aphura_sovereign_agent": {
          try {
            const { HermesAgentService } = await import("../agents/hermes.service.js");
            const res = await HermesAgentService.executeTask(args.prompt);
            return { output: `Aphura Sovereign Agent Output:\n${res.content}` };
          } catch (err) {
            return { output: `Agent failure: ${err.message}` };
          }
        }
        case "analyze_legal_contract": {
          try {
            const { OpenClawService } = await import("../agents/openclaw.service.js");
            const res = await OpenClawService.analyzeContract(args.contract_text);
            return { output: `Aphura Legal Engine Output:\n${res.content}` };
          } catch (err) {
            return { output: `Legal scan failure: ${err.message}` };
          }
        }        case "browser_use_action": {
          try {
            const { BrowserUseService } = await import("../browser/browser.service.js");
            if (args.action === "launch") {
              const res = await BrowserUseService.launchBrowser(args.sessionId, args.url_or_target);
              return { output: `Browser launched at ${args.url_or_target}. DOM loaded.` };
            } else if (args.action === "close") {
              await BrowserUseService.closeBrowser(args.sessionId);
              return { output: "Browser closed." };
            } else {
              const res = await BrowserUseService.executeAction(args.sessionId, args.action, args.url_or_target);
              return { output: `Action ${args.action} completed. New DOM state observed.` };
            }
          } catch (err) {
            return { output: `Browser action failed: ${err.message}` };
          }
        }        case "query_knowledgebase": {
          try {
            const { VectorStoreService } = await import("../rag/vectorstore.service.js");
            const { llmEmbed } = await import("../../services/llm.client.js");
            const embedding = await llmEmbed(args.query);
            const collectionId = args.collectionId || "default_tenant_collection";
            const results = await VectorStoreService.search(embedding, { collectionId, topK: 10 });
            const context = results.map(r => `[Source: ${r.document_title || "Unknown"}]n${r.content}`).join("\n\n");
            return { output: `RAG Context Retrieved:\n${context}`, references: results.map(r => ({ title: r.document_title, url: r.document_source, snippet: r.content.substring(0, 100), source: "Enterprise Memory" })) };
          } catch (err) {
            return { output: `RAG query failed: ${err.message}`, references: [] };
          }
        }        case 'execute_edge_command': {
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
          const res = await ExaSearchService.searchDirectly(args.query, { numResults: args.numResults || 5 });
          const results = res?.results || [];
          return {
            output: results.map((r, i) => {
              const highlights = Array.isArray(r.highlights) && r.highlights.length ? `\nKey Highlights:\n- ${r.highlights.join('\n- ')}` : '';
              const textSnippet = r.text ? `\nExcerpt: ${r.text.slice(0, 1000)}` : (r.summary ? `\nSummary: ${r.summary}` : '');
              return `[${i + 1}] Title: ${r.title}\nURL: ${r.url}\nDate: ${r.publishedDate || 'Recent'}${highlights}${textSnippet}`;
            }).join('\n\n---\n\n'),
            references: results.map(r => ({
              title: r.title || 'Web Result',
              url: r.url,
              snippet: (Array.isArray(r.highlights) && r.highlights[0]) || r.summary || (r.text ? r.text.slice(0, 250) : ''),
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
            references: [{ type: 'image', url: imageUrl }],
            customMetadata
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
            references: [{ type: 'sec', url: `https://www.sec.gov/edgar/browse/?CIK=${secData.cik}` }],
            customMetadata
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
          try {
            const res = await ComposioService.executeTool(args.tool_slug, args.params, 'system-session');
            return { output: JSON.stringify(res), references: [] };
          } catch (err) {
            return { output: `Composio action failed: ${err.message}`, references: [] };
          }
        }
        case 'desktop_computer_use': {
          try {
            // Note: In production, user context (userId) needs to be passed down through options to this handler
            // For now, we simulate success if the gateway is running.
            const { DesktopGateway } = await import('../desktop/desktop.gateway.js');
            // Mock userId for demonstration, should be passed from req.user
            await DesktopGateway.dispatchComputerUseAction('admin_user', { action: args.action, payload: args.payload });
            return { output: 'Action successfully dispatched to local desktop app.', references: [] };
          } catch (err) {
            return { output: `Desktop link failed: ${err.message}. Make sure the Desktop App is running and connected.`, references: [] };
          }
        }
        case 'cloud_code_interpreter': {
          try {
            const { default: OpenStackService } = await import('../../services/openstack.service.js');
            // Execute on Aphura bare-metal via Zun Container Sandbox
            const result = await OpenStackService.executeAirGappedCode(args.code, args.language || 'python', false);
            return { 
              output: `Code execution initiated in Zun Sandbox ${result.containerId}. Status: ${result.status}`, 
              references: [{ title: 'Code Interpreter', url: 'aphura://zun-sandbox', snippet: 'Isolated compute container', source: 'Aphura' }]
            };
          } catch (err) {
            return { output: `Cloud code execution failed: ${err.message}`, references: [] };
          }
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

        // ── LangGraph: Deep Research Swarm (Exa-Powered) ────────────────────
        case 'deep_research': {
          try {
            const result = await LangGraphService.runResearchSwarm({
              query: args.query,
              perspectives: args.perspectives || 3,
            });
            customMetadata = { domain: 'deep_research', query: args.query, perspectives: result.perspectives?.length || 0 };
            // Use real Exa web references if available, fall back to perspective-based refs
            const realRefs = result.references && result.references.length > 0
              ? result.references
              : (result.perspectives || []).flatMap(p => (p.sources || []).length > 0
                ? p.sources
                : [{ title: p.angle, url: 'local://langgraph-swarm', snippet: (p.findings || '').slice(0, 200), source: 'LangGraph Research Swarm' }]
              );
            return {
              output: `Research Synthesis:\n${result.synthesis}\n\nPerspectives Investigated: ${result.perspectives?.length || 0}`,
              references: realRefs
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

        // ── LangChain: QA with Citations (auto-fetches web docs if none provided) ──
        case 'langchain_qa': {
          try {
            let documents = args.documents || [];
            let webRefs = [];

            // If no documents provided, auto-search web for source docs
            if (documents.length === 0) {
              try {
                const exaRes = await ExaSearchService.searchDirectly(args.query, {
                  numResults: 5,
                  contents: { text: { maxCharacters: 2000 } },
                });
                const exaResults = exaRes?.results || [];
                documents = exaResults.map(r => `[${r.title}] (${r.url})\n${r.text || r.summary || ''}`);
                webRefs = exaResults.map(r => ({
                  title: r.title || 'Web Source',
                  url: r.url,
                  snippet: (r.text || r.summary || '').slice(0, 200),
                  source: 'Exa Neural Search',
                }));
              } catch (err) {
                logger.warn(`[langchain_qa] Exa auto-fetch failed: ${err.message}`);
              }
            }

            const result = await LangChainService.runQAChain({
              query: args.query,
              documents,
            });
            return {
              output: result.answer,
              references: webRefs.length > 0
                ? webRefs
                : [{ title: 'QA Chain Result', url: 'local://langchain', snippet: result.answer.slice(0, 200), source: 'LangChain QA Chain' }]
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

        // ── Aphura ──────────────────────────────────────────────
        case 'liberty_query': {
          try {
            let params = {};
            try { params = JSON.parse(args.params || '{}'); } catch { params = { raw: args.params }; }
            const result = await LibertyService.query(args.action, params);
            customMetadata = { domain: 'liberty_platform', action: args.action, result: result };
            return {
              output: typeof result === 'string' ? result : JSON.stringify(result, null, 2).slice(0, 3000),
              references: [{ title: `Liberty: ${args.action}`, url: 'local://liberty', snippet: `Action: ${args.action}`, source: 'Aphura' }]
            };
          } catch (error) {
            return { output: `Liberty query failed: ${error.message}`, references: [] };
          }
        }

        // ── NOAA Weather (Direct National Weather Service) ─────────────
        case 'get_noaa_weather': {
          try {
            const res = await fetch(`https://api.weather.gov/points/${args.latitude},${args.longitude}`, {
              headers: { 'User-Agent': 'AphuraSovereign/1.0 (admin@insohq.com)' }
            });
            const data = await res.json();
            const forecastUrl = data.properties?.forecast;
            let forecastText = '';
            if (forecastUrl) {
              const fRes = await fetch(forecastUrl, { headers: { 'User-Agent': 'AphuraSovereign/1.0' } });
              const fData = await fRes.json();
              const periods = (fData.properties?.periods || []).slice(0, 3);
              forecastText = periods.map(p => `${p.name}: ${p.temperature}°${p.temperatureUnit}, ${p.shortForecast}`).join('\n');
            }
            customMetadata = { domain: 'noaa_weather', coordinates: { lat: args.latitude, lon: args.longitude } };
            return {
              output: `NOAA Weather Forecast (${data.properties?.relativeLocation?.properties?.city || 'Zone'}):\n${forecastText || 'Atmospheric observations recorded.'}`,
              references: [{ title: 'NOAA National Weather Service', url: 'https://www.weather.gov', snippet: 'Official US NWS Weather Radar', source: 'NOAA' }]
            };
          } catch (e) {
            return { output: `NOAA weather lookup failed: ${e.message}`, references: [] };
          }
        }

        // ── NIH PubMed (36M+ Peer-Reviewed Medical Papers) ──────────────
        case 'search_nih_pubmed': {
          try {
            const searchRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(args.term)}&retmode=json&retmax=${args.retmax || 4}`);
            const searchData = await searchRes.json();
            const idList = searchData.esearchresult?.idlist || [];
            if (!idList.length) {
              return { output: `No PubMed clinical papers found for "${args.term}".`, references: [] };
            }
            const sumRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${idList.join(',')}&retmode=json`);
            const sumData = await sumRes.json();
            const summaries = idList.map(id => {
              const doc = sumData.result?.[id] || {};
              return `• [PMID:${id}] ${doc.title} (${doc.source || 'Journal'}, ${doc.pubdate || ''})`;
            }).join('\n');
            customMetadata = { domain: 'nih_pubmed', pmids: idList };
            return {
              output: `NIH PubMed Peer-Reviewed Biomedical Papers:\n${summaries}`,
              references: idList.map(id => ({
                title: sumData.result?.[id]?.title || `PubMed Article ${id}`,
                url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                snippet: sumData.result?.[id]?.source || 'NIH PubMed NLM',
                source: 'NIH PubMed'
              }))
            };
          } catch (e) {
            return { output: `NIH PubMed search failed: ${e.message}`, references: [] };
          }
        }

        // ── UN Comtrade (International Bilateral Trade Statistics) ───────
        case 'get_un_trade_data': {
          try {
            const res = await fetch(`https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=${args.reporterCode}&partnerCode=${args.partnerCode || 0}`, {
              headers: { 'User-Agent': 'AphuraSovereign/1.0' }
            });
            const data = await res.json();
            const records = (data.data || []).slice(0, 5).map(r => `${r.cmdDesc || 'Commodity'}: Trade Value $${r.primaryValue?.toLocaleString?.() || r.primaryValue}`);
            customMetadata = { domain: 'un_comtrade' };
            return {
              output: `United Nations Comtrade International Trade Statistics:\n${records.join('\n') || 'Official UN Trade statistics recorded.'}`,
              references: [{ title: 'UN Comtrade Database', url: 'https://comtradeplus.un.org', snippet: 'Official Bilateral Trade Statistics', source: 'United Nations' }]
            };
          } catch (e) {
            return { output: `UN Comtrade lookup failed: ${e.message}`, references: [] };
          }
        }

        // ── USPTO Patents (Official U.S. Patent & Trademark Office) ──────
        case 'search_uspto_patents': {
          try {
            const queryParam = encodeURIComponent(JSON.stringify({ _text_any: { patent_title: args.keyword } }));
            const res = await fetch(`https://api.patentsview.org/patents/query?q=${queryParam}&f=[%22patent_number%22,%22patent_title%22,%22patent_date%22]`, {
              headers: { 'User-Agent': 'AphuraSovereign/1.0' }
            });
            const data = await res.json();
            const patents = (data.patents || []).slice(0, 4).map(p => `• Patent US${p.patent_number}: "${p.patent_title}" (${p.patent_date})`);
            customMetadata = { domain: 'uspto_patents' };
            return {
              output: `USPTO Patent & Intellectual Property Registry:\n${patents.join('\n') || 'No direct patent matches found.'}`,
              references: (data.patents || []).slice(0, 4).map(p => ({
                title: `US Patent ${p.patent_number}: ${p.patent_title}`,
                url: `https://patents.google.com/patent/US${p.patent_number}`,
                snippet: p.patent_title,
                source: 'USPTO'
              }))
            };
          } catch (e) {
            return { output: `USPTO patent search failed: ${e.message}`, references: [] };
          }
        }

        // ── OpenAlex (Global Scholarly Literature & Citations Graph) ────
        case 'search_openalex_papers': {
          try {
            const res = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(args.query)}&per_page=4`, {
              headers: { 'User-Agent': 'mailto:admin@insohq.com' }
            });
            const data = await res.json();
            const papers = (data.results || []).map(w => `• "${w.title}" (${w.publication_year}) - Cited by: ${w.cited_by_count} - DOI: ${w.doi || 'N/A'}`);
            customMetadata = { domain: 'openalex_science' };
            return {
              output: `OpenAlex Global Scientific Knowledge Graph:\n${papers.join('\n') || 'Scientific research papers located.'}`,
              references: (data.results || []).map(w => ({
                title: w.title,
                url: w.doi || w.id,
                snippet: `Cited by ${w.cited_by_count} researchers. Published ${w.publication_year}.`,
                source: 'OpenAlex'
              }))
            };
          } catch (e) {
            return { output: `OpenAlex search failed: ${e.message}`, references: [] };
          }
        }

        // ── NASA ────────────────────────────────────────────────────────
        case 'get_nasa_data': {
          try {
            const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY`);
            const data = await res.json();
            return {
              output: `NASA Data: ${data.title}\n${data.explanation}`,
              references: [{ title: data.title, url: data.url, snippet: 'NASA APOD', source: 'NASA' }]
            };
          } catch (e) {
            return { output: 'Failed to fetch NASA data', references: [] };
          }
        }

        // ── World Bank ──────────────────────────────────────────────────
        case 'get_world_bank_data': {
          try {
            const res = await fetch(`https://api.worldbank.org/v2/country/${args.country_code}/indicator/${args.indicator}?format=json`);
            const data = await res.json();
            return {
              output: `World Bank Data: ${JSON.stringify(data[1]?.[0] || data).slice(0, 500)}`,
              references: [{ title: 'World Bank Indicator', url: 'local://worldbank', snippet: args.indicator, source: 'World Bank' }]
            };
          } catch (e) {
            return { output: 'Failed to fetch World Bank data', references: [] };
          }
        }

        // ── USGS Earthquakes ────────────────────────────────────────────
        case 'get_usgs_earthquakes': {
          try {
            const minMag = args.min_magnitude || 4.5;
            const res = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=${minMag}&limit=5`);
            const data = await res.json();
            const quakes = data.features.map(f => `Magnitude ${f.properties.mag} - ${f.properties.place}`).join('\n');
            return {
              output: `Recent Earthquakes (Mag >= ${minMag}):\n${quakes}`,
              references: [{ title: 'USGS Earthquake Hazards', url: 'local://usgs', snippet: 'USGS', source: 'USGS' }]
            };
          } catch (e) {
            return { output: 'Failed to fetch USGS data', references: [] };
          }
        }

        // ── USDA Agriculture ────────────────────────────────────────────
        case 'get_usda_agriculture': {
          try {
            return {
              output: `USDA Crop Progress: ${args.commodity} is currently in typical planting/harvesting season phases based on historical averages. (Mock USDA response)`,
              references: [{ title: 'USDA NASS', url: 'local://usda', snippet: args.commodity, source: 'USDA' }]
            };
          } catch (e) {
            return { output: 'Failed to fetch USDA data', references: [] };
          }
        }

        default:
          return { output: `Error: Tool ${name} not recognized.`, references: [] };
        }
      };

      const res = await executeInternal();
      if (res && typeof res === 'object') {
        if (!res.customMetadata && customMetadata) {
          res.customMetadata = customMetadata;
        }
      }
      // Fire-and-forget tool usage metering
      if (userId) {
        recordToolUsage(userId, name, Date.now() - startTime, true).catch(() => {});
      }
      return res;
    } catch (error) {
      logger.error(`[AgentService] Tool ${name} failed: ${error.message}`);
      // Record failed tool execution
      if (userId) {
        recordToolUsage(userId, name, Date.now() - startTime, false).catch(() => {});
      }
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
      
      // Use fast 8B model for tool selection (simple classification task)
      // Reserve full model for final synthesis where quality matters
      const toolCallOptions = {
        ...options,
        model: config.llm?.lightModel || 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      };
      const response = await llmToolCall(messages, tools, toolCallOptions);
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
        // No tool calls means the agent is ready with the answer.
        // Deliver the already-generated answer immediately to avoid 2x latency penalty
        if (responseMessage.content) {
          logger.info(`[AgentService] Delivering synthesized answer (${responseMessage.content.length} chars)...`);
          const words = responseMessage.content.split(/(\s+)/);
          for (let i = 0; i < words.length; i += 4) {
            yield { type: 'text', content: words.slice(i, i + 4).join('') };
          }
        } else {
          logger.info(`[AgentService] Empty content, streaming via llmStream...`);
          const stream = await llmStream(messages, options);
          for await (const chunk of stream) {
            const text = chunk.choices?.[0]?.delta?.content;
            if (text) {
              yield { type: 'text', content: text };
            }
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
      // Use fast 8B model for tool selection, full model for final synthesis
      const lightModel = config.llm?.lightModel || 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';
      while (stepCount < maxSteps) {
        stepCount++;
        const response = await llmToolCall(messages, tools, { model: lightModel, temperature });
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
