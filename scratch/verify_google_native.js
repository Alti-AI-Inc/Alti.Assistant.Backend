import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the services directly to verify imports compile perfectly
import { GcpVisionService } from '../src/app/modules/gcp_native/gcp-vision.service.js';
import { GcpSpeechService } from '../src/app/modules/gcp_native/gcp-speech.service.js';
import { GcpWorkspaceService } from '../src/app/modules/gcp_native/gcp-workspace.service.js';
import { GcpNlpService } from '../src/app/modules/gcp_native/gcp-nlp.service.js';
import { GcpVideoIntelService } from '../src/app/modules/gcp_native/gcp-video-intel.service.js';
import { GcpEmbeddingsService } from '../src/app/modules/gcp_native/gcp-embeddings.service.js';
import { GcpTranslateAdvancedService } from '../src/app/modules/gcp_native/gcp-translate-advanced.service.js';
import { GcpStorageService } from '../src/app/modules/gcp_native/gcp-storage.service.js';
import { GcpBigqueryService } from '../src/app/modules/gcp_native/gcp-bigquery.service.js';
import { GcpSecretsService } from '../src/app/modules/gcp_native/gcp-secrets.service.js';
import { GcpPubSubService } from '../src/app/modules/gcp_native/gcp-pubsub.service.js';
import { GcpDocumentAiService } from '../src/app/modules/gcp_native/gcp-document-ai.service.js';
import { GcpVertexGroundingService } from '../src/app/modules/gcp_native/gcp-vertex-grounding.service.js';
import { GcpMapsService } from '../src/app/modules/gcp_native/gcp-maps.service.js';
import { GcpBusinessService } from '../src/app/modules/gcp_native/gcp-business.service.js';
import { GcpLoggingService } from '../src/app/modules/gcp_native/gcp-logging.service.js';
import { GcpErrorsService } from '../src/app/modules/gcp_native/gcp-errors.service.js';
import { GcpRecaptchaService } from '../src/app/modules/gcp_native/gcp-recaptcha.service.js';
import { GcpSearchAggregatorService } from '../src/app/modules/gcp_native/gcp-search-aggregator.service.js';
import { GcpKnowledgeGraphService } from '../src/app/modules/gcp_native/gcp-knowledge-graph.service.js';
import { GcpTasksService } from '../src/app/modules/gcp_native/gcp-tasks.service.js';
import { GcpSafeBrowsingService } from '../src/app/modules/gcp_native/gcp-safe-browsing.service.js';
import { GcpFontsService } from '../src/app/modules/gcp_native/gcp-fonts.service.js';
import { GcpSuggestService } from '../src/app/modules/gcp_native/gcp-suggest.service.js';
import { GcpVertexSearchService } from '../src/app/modules/gcp_native/gcp-vertex-search.service.js';
import { GcpTrendsService } from '../src/app/modules/gcp_native/gcp-trends.service.js';
import { GcpA2uiService } from '../src/app/modules/gcp_native/gcp-a2ui.service.js';
import { GcpAguiService } from '../src/app/modules/gcp_native/gcp-agui.service.js';
import { GcpA2aService } from '../src/app/modules/gcp_native/gcp-a2a.service.js';
import { GcpAdkService } from '../src/app/modules/gcp_native/gcp-adk.service.js';
import { GcpMcpService } from '../src/app/modules/gcp_native/gcp-mcp.service.js';
import { workflowExecutionService } from '../src/app/modules/workflow_automation/services/workflowExecution.service.js';

console.log('🚀 INITIALIZING GOOGLE & GCP INTEGRATION COMPILE & RUNTIME CHECKER (PHASE 12)...\n');

async function testCompilations() {
  console.log('====================================================');
  console.log('TEST 1: Verifying Service Modules Load and Compile');
  console.log('====================================================');

  const services = [
    { name: 'GcpVisionService', service: GcpVisionService, method: 'analyzeImage' },
    { name: 'GcpSpeechService', service: GcpSpeechService, method: 'synthesizeSpeech' },
    { name: 'GcpWorkspaceService', service: GcpWorkspaceService, method: 'sheetsCreate' },
    { name: 'GcpNlpService', service: GcpNlpService, method: 'analyzeText' },
    { name: 'GcpVideoIntelService', service: GcpVideoIntelService, method: 'startVideoAnalysis' },
    { name: 'GcpEmbeddingsService', service: GcpEmbeddingsService, method: 'getTextEmbeddings' },
    { name: 'GcpTranslateAdvancedService', service: GcpTranslateAdvancedService, method: 'detectTextLanguage' },
    { name: 'GcpStorageService', service: GcpStorageService, method: 'createBucket' },
    { name: 'GcpBigqueryService', service: GcpBigqueryService, method: 'createTable' },
    { name: 'GcpSecretsService', service: GcpSecretsService, method: 'getSecretValue' },
    { name: 'GcpPubSubService', service: GcpPubSubService, method: 'publishMessage' },
    { name: 'GcpDocumentAiService', service: GcpDocumentAiService, method: 'processDocument' },
    { name: 'GcpVertexGroundingService', service: GcpVertexGroundingService, method: 'groundedPromptResponse' },
    { name: 'GcpMapsService', service: GcpMapsService, method: 'geocodeAddress' },
    { name: 'GcpBusinessService', service: GcpBusinessService, method: 'getUnifiedBusinessIntelligence' },
    { name: 'GcpLoggingService', service: GcpLoggingService, method: 'writeLogEntry' },
    { name: 'GcpErrorsService', service: GcpErrorsService, method: 'reportError' },
    { name: 'GcpRecaptchaService', service: GcpRecaptchaService, method: 'verifyRecaptchaToken' },
    { name: 'GcpSearchAggregatorService', service: GcpSearchAggregatorService, method: 'executeParallelSearch' },
    { name: 'GcpKnowledgeGraphService', service: GcpKnowledgeGraphService, method: 'lookupEntity' },
    { name: 'GcpTasksService', service: GcpTasksService, method: 'createHttpTask' },
    { name: 'GcpSafeBrowsingService', service: GcpSafeBrowsingService, method: 'lookupUrlSafety' },
    { name: 'GcpFontsService', service: GcpFontsService, method: 'resolveGoogleFonts' },
    { name: 'GcpSuggestService', service: GcpSuggestService, method: 'getSearchSuggestions' },
    { name: 'GcpVertexSearchService', service: GcpVertexSearchService, method: 'searchDataStore' },
    { name: 'GcpTrendsService', service: GcpTrendsService, method: 'getTrendingSearches' },
    { name: 'GcpA2uiService', service: GcpA2uiService, method: 'parseAndValidateA2ui' },
    { name: 'GcpA2uiServiceAdvanced', service: GcpA2uiService, method: 'fixA2uiPayload' },
    { name: 'GcpA2uiServiceRpc', service: GcpA2uiService, method: 'handleA2uiRpc' },
    { name: 'GcpAguiService', service: GcpAguiService, method: 'parseAndValidateAgui' },
    { name: 'GcpA2aService', service: GcpA2aService, method: 'parseAndValidateA2a' },
    { name: 'GcpAdkService', service: GcpAdkService, method: 'bootstrapAdkExtension' },
    { name: 'GcpMcpService', service: GcpMcpService, method: 'executeMcpTool' }
  ];

  for (const item of services) {
    if (item.service && typeof item.service[item.method] === 'function') {
      console.log(`✓ ${item.name} compiled and loaded successfully!`);
    } else {
      throw new Error(`${item.name} failed to compile or lacks required method "${item.method}".`);
    }
  }
}

async function testWorkflowMockExecution() {
  console.log('\n====================================================');
  console.log('TEST 2: Dry-Running Workflow Step Actions (Mock Mode)');
  console.log('====================================================');

  // Temporarily force Temporal mock & offline mode to execute mock branches in workflowExecutionService
  process.env.TEMPORAL_MOCK = 'true';
  process.env.OFFLINE_MODE = 'true';

  const mockContext = {
    _executionId: 'mock_verification_exec_id',
    step1_result: { text: 'Hello from verification test' }
  };

  // Define steps matching each of the new actions
  const stepsToTest = [
    {
      stepId: 'step_vision',
      app: 'google_cloud',
      action: 'gcp_vision_analyze',
      parameters: {
        contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
      }
    },
    {
      stepId: 'step_tts',
      app: 'google_cloud',
      action: 'gcp_text_to_speech',
      parameters: {
        text: 'Google Cloud Platform integrations are active.'
      }
    },
    {
      stepId: 'step_stt',
      app: 'google_cloud',
      action: 'gcp_speech_to_text',
      parameters: {
        audioBase64: 'dGVzdF9tb2NrX2F1ZGlvX2NvbnRlbnRfMTIzNDU='
      }
    },
    {
      stepId: 'step_nlp',
      app: 'google_cloud',
      action: 'gcp_nlp_analyze',
      parameters: {
        text: 'Google Cloud is an amazing platform!'
      }
    },
    {
      stepId: 'step_video_intel',
      app: 'google_cloud',
      action: 'gcp_video_analyze',
      parameters: {
        contentBase64: 'dGVzdF92aWRlb19iYXNlNjQ='
      }
    },
    {
      stepId: 'step_embeddings',
      app: 'google_cloud',
      action: 'gcp_generate_embeddings',
      parameters: {
        text: 'Embedding semantic coordinates for Alti platform search query routing.'
      }
    },
    {
      stepId: 'step_language_detect',
      app: 'google_cloud',
      action: 'gcp_detect_language',
      parameters: {
        text: 'Esta sesión está dedicada a integraciones nativas de Google.'
      }
    },
    {
      stepId: 'step_translate_doc',
      app: 'google_cloud',
      action: 'gcp_translate_document',
      parameters: {
        contentBase64: 'dGVzdF9tb2NrX2RvY3VtZW50X2J5dGVz',
        mimeType: 'application/pdf',
        targetLanguageCode: 'fr',
        sourceLanguageCode: 'es'
      }
    },
    {
      stepId: 'step_storage_create_bucket',
      app: 'google_cloud',
      action: 'gcp_storage_create_bucket',
      parameters: {
        bucketName: 'verify-alti-enterprise-storage-2026',
        location: 'us-east1'
      }
    },
    {
      stepId: 'step_storage_signed_url',
      app: 'google_cloud',
      action: 'gcp_storage_signed_url',
      parameters: {
        bucketName: 'verify-alti-enterprise-storage-2026',
        fileName: 'exports/financial_ledger_2026.csv',
        action: 'write',
        expiresMinutes: 45
      }
    },
    {
      stepId: 'step_bigquery_create_table',
      app: 'google_cloud',
      action: 'gcp_bigquery_create_table',
      parameters: {
        datasetId: 'verification_warehouse',
        tableId: 'audit_logs',
        schemaFields: [
          { name: 'log_id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'severity', type: 'STRING', mode: 'NULLABLE' },
          { name: 'timestamp', type: 'TIMESTAMP', mode: 'NULLABLE' },
          { name: 'message', type: 'STRING', mode: 'NULLABLE' }
        ]
      }
    },
    {
      stepId: 'step_bigquery_load_csv',
      app: 'google_cloud',
      action: 'gcp_bigquery_load_csv',
      parameters: {
        datasetId: 'verification_warehouse',
        tableId: 'audit_logs',
        gcsUri: 'gs://verify-alti-enterprise-storage-2026/exports/audit_logs.csv'
      }
    },
    {
      stepId: 'step_secrets_get',
      app: 'google_cloud',
      action: 'gcp_secrets_get',
      parameters: {
        secretId: 'ALTI_MASTER_ENCRYPTION_KEY'
      }
    },
    {
      stepId: 'step_pubsub_publish',
      app: 'google_cloud',
      action: 'gcp_pubsub_publish',
      parameters: {
        topicId: 'user-notifications',
        messageData: {
          userId: 'user_99981',
          eventType: 'SECURITY_ALERT',
          severity: 'HIGH',
          timestamp: new Date().toISOString()
        }
      }
    },
    {
      stepId: 'step_document_ai_process',
      app: 'google_cloud',
      action: 'gcp_document_ai_process',
      parameters: {
        contentBase64: 'dGVzdF9tb2NrX2RvY3VtZW50X2J5dGVz',
        mimeType: 'application/pdf',
        processorId: 'mock-proc-123'
      }
    },
    {
      stepId: 'step_vertex_grounded_prompt',
      app: 'google_cloud',
      action: 'gcp_vertex_grounded_prompt',
      parameters: {
        prompt: 'Who won the 2026 super bowl?',
        sessionId: 'verification-ground-sess-991'
      }
    },
    {
      stepId: 'step_maps_geocode',
      app: 'google_cloud',
      action: 'gcp_maps_geocode',
      parameters: {
        address: '1600 Amphitheatre Pkwy, Mountain View, CA'
      }
    },
    {
      stepId: 'step_maps_places_search',
      app: 'google_cloud',
      action: 'gcp_maps_places_search',
      parameters: {
        latitude: 37.422,
        longitude: -122.084,
        radius: 1000,
        keyword: 'restaurants'
      }
    },
    {
      stepId: 'step_maps_directions',
      app: 'google_cloud',
      action: 'gcp_maps_directions',
      parameters: {
        origin: 'San Francisco, CA',
        destination: 'Mountain View, CA',
        mode: 'driving'
      }
    },
    {
      stepId: 'step_maps_place_details',
      app: 'google_cloud',
      action: 'gcp_maps_place_details',
      parameters: {
        placeId: 'ChIJ2eUgeAK6j4ARbn5u_wBq0hs'
      }
    },
    {
      stepId: 'step_maps_place_photo',
      app: 'google_cloud',
      action: 'gcp_maps_place_photo',
      parameters: {
        photoReference: 'photo_ref_googleplex_12345'
      }
    },
    {
      stepId: 'step_business_list_locations',
      app: 'google_cloud',
      action: 'gcp_business_list_locations',
      parameters: {
        accountId: 'pub_991823'
      }
    },
    {
      stepId: 'step_business_list_reviews',
      app: 'google_cloud',
      action: 'gcp_business_list_reviews',
      parameters: {
        accountId: 'pub_991823',
        locationId: 'loc_valley_992'
      }
    },
    {
      stepId: 'step_business_create_post',
      app: 'google_cloud',
      action: 'gcp_business_create_post',
      parameters: {
        accountId: 'pub_991823',
        locationId: 'loc_valley_992',
        postPayload: {
          summary: 'Alti Location Review and deep business profile integration is live!'
        }
      }
    },
    {
      stepId: 'step_business_unified_analytics',
      app: 'google_cloud',
      action: 'gcp_business_unified_analytics',
      parameters: {
        query: 'Googleplex Mountain View'
      }
    },
    {
      stepId: 'step_logging_write',
      app: 'google_cloud',
      action: 'gcp_logging_write',
      parameters: {
        logName: 'alti-audit-log',
        message: 'Platform GCP verification diagnostic compile passed gloriously.',
        severity: 'NOTICE',
        labels: { trigger: 'AUTOMATED_TEST' }
      }
    },
    {
      stepId: 'step_errors_report',
      app: 'google_cloud',
      action: 'gcp_errors_report',
      parameters: {
        errorMessage: 'Verification simulation: testing stacktrace dispatches.',
        stackTrace: 'Error: Simulation at verify_google_native.js:292:15',
        user: 'diagnostic_user_992'
      }
    },
    {
      stepId: 'step_recaptcha_verify',
      app: 'google_cloud',
      action: 'gcp_recaptcha_verify',
      parameters: {
        token: 'verification_token_re_enterprise_555',
        expectedAction: 'checkout'
      }
    },
    {
      stepId: 'step_advanced_search',
      app: 'google_cloud',
      action: 'gcp_advanced_search',
      parameters: {
        query: 'electric vehicle market trends',
        searchType: 'web',
        numResults: 5
      }
    },
    {
      stepId: 'step_knowledge_graph_lookup',
      app: 'google_cloud',
      action: 'gcp_knowledge_graph_lookup',
      parameters: {
        query: 'Alphabet Inc.',
        limit: 3
      }
    },
    {
      stepId: 'step_tasks_create',
      app: 'google_cloud',
      action: 'gcp_tasks_create',
      parameters: {
        queueName: 'alti-default-tasks',
        url: 'https://api.altihq.com/webhook/task-callback',
        payload: { event: 'verification_completed' },
        delaySeconds: 60
      }
    },
    {
      stepId: 'step_safe_browsing_check',
      app: 'google_cloud',
      action: 'gcp_safe_browsing_check',
      parameters: {
        url: 'http://example-malware-url.com'
      }
    },
    {
      stepId: 'step_fonts_resolve',
      app: 'google_cloud',
      action: 'gcp_fonts_resolve',
      parameters: {
        filterQuery: 'Montserrat',
        sortBy: 'popularity',
        limit: 5
      }
    },
    {
      stepId: 'step_search_suggest',
      app: 'google_cloud',
      action: 'gcp_search_suggest',
      parameters: {
        query: 'machine learning',
        language: 'en'
      }
    },
    {
      stepId: 'step_vertex_search',
      app: 'google_cloud',
      action: 'gcp_vertex_search',
      parameters: {
        dataStoreId: 'wiki-search-store',
        query: 'quantum computing'
      }
    },
    {
      stepId: 'step_trends_fetch',
      app: 'google_cloud',
      action: 'gcp_trends_fetch',
      parameters: {
        geo: 'US'
      }
    },
    {
      stepId: 'step_a2ui_render',
      app: 'google_cloud',
      action: 'gcp_a2ui_render',
      parameters: {
        rawText: 'Here is the interface: <a2ui-json>[{"surfaceUpdate": {"root": "my-col", "components": [{"id": "my-col", "type": "column", "children": []}]}}]</a2ui-json>'
      }
    },
    {
      stepId: 'step_a2ui_stream',
      app: 'google_cloud',
      action: 'gcp_a2ui_stream_parse',
      parameters: {
        chunk: 'Here is conversational text: <a2ui-json>[{ id: "main", type: "column", children: [] }, ]</a2ui-json>',
        state: { buffer: '', insideTag: false }
      }
    },
    {
      stepId: 'step_mcp_bridge',
      app: 'google_cloud',
      action: 'gcp_mcp_bridge',
      parameters: {
        toolsetName: 'alti-default-postgres',
        toolName: 'execute_sql',
        mcpParameters: {
          statement: 'SELECT * FROM security_alerts LIMIT 5;'
        }
      }
    },
    {
      stepId: 'step_a2ui_rpc_dispatch',
      app: 'google_cloud',
      action: 'gcp_a2ui_rpc_dispatch',
      parameters: {
        sessionState: {},
        rpcPayload: {
          componentId: 'submit-btn',
          action: 'click',
          values: { inputVal: 'test data' }
        }
      }
    },
    {
      stepId: 'step_agui_render',
      app: 'google_cloud',
      action: 'gcp_agui_render',
      parameters: {
        rawText: 'Here is AGUI: <agui-json>[{"canvasUpdate": {"root": "grid-layout", "components": [{"id": "grid-layout", "type": "dashboardGrid", "children": []}]}}]</agui-json>'
      }
    },
    {
      stepId: 'step_a2a_dispatch',
      app: 'google_cloud',
      action: 'gcp_a2a_dispatch',
      parameters: {
        rawText: 'Handoff starting: <a2a-packet>{"sender": "Planner", "recipient": "Coder", "seqId": "seq_1", "securityToken": "sec_token_valid", "payload": {"action": "generate", "parameters": {}}}</a2a-packet>'
      }
    },
    {
      stepId: 'step_adk_bootstrap',
      app: 'google_cloud',
      action: 'gcp_adk_bootstrap',
      parameters: {
        manifest: {
          name: 'verification-ext',
          version: '1.0.0',
          scope: 'gcp-mcp-extensions',
          permissions: ['read_file'],
          entryPoints: {
            routePrefix: '/ext/verification-ext',
            activities: ['step_1']
          }
        }
      }
    },
    {
      stepId: 'step_sheets_create',
      app: 'google_workspace',
      action: 'sheets_create',
      parameters: {
        title: 'Alti Verification Sheet'
      }
    },
    {
      stepId: 'step_sheets_read',
      app: 'google_workspace',
      action: 'sheets_read',
      parameters: {
        spreadsheetId: 'mock_spreadsheet_id_123',
        range: 'Sheet1!A1:B2'
      }
    },
    {
      stepId: 'step_docs_create',
      app: 'google_workspace',
      action: 'docs_create',
      parameters: {
        title: 'Alti Verification Doc',
        bodyText: 'System verification payload content.'
      }
    },
    {
      stepId: 'step_calendar_create',
      app: 'google_workspace',
      action: 'calendar_create_event',
      parameters: {
        summary: 'Alti Integration Status Review',
        startTime: '2026-05-25T14:00:00-04:00',
        endTime: '2026-05-25T15:00:00-04:00'
      }
    },
    {
      stepId: 'step_calendar_list',
      app: 'google_workspace',
      action: 'calendar_list_events',
      parameters: {}
    },
    {
      stepId: 'step_drive_download',
      app: 'google_workspace',
      action: 'drive_download',
      parameters: {
        fileId: 'mock_drive_file_id_555'
      }
    }
  ];

  for (const step of stepsToTest) {
    console.log(`Running step: ${step.stepId} -> ${step.app}.${step.action}...`);
    const output = await workflowExecutionService.executeStep(step, mockContext, 'mock_user_123');
    
    if (output && (output.success || output.reply || output.postId || output.score)) {
      console.log(`✓ Step ${step.stepId} completed successfully! Output keys:`, Object.keys(output.data || output || {}));
    } else {
      throw new Error(`Step ${step.stepId} execution failed!`);
    }
  }

  console.log('\n✅ All new GCP & Workspace workflow actions successfully executed and verified under mock branch!');
}

async function run() {
  try {
    await testCompilations();
    await testWorkflowMockExecution();
    console.log('\n🎉 ALL GOOGLE CLOUD AND GOOGLE WORKSPACE API VERIFICATIONS PASSED GLORIOUSLY!');
  } catch (err) {
    console.error('\n❌ Verification Failed:', err.message);
    process.exit(1);
  }
}

run();
