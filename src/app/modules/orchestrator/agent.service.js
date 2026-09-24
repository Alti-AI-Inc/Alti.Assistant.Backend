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
      name: "execute_openeventproxy_logic",
      description: "Use the Aphura Engine (OpenEventProxy) to Autonomously deploy Event Streaming architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_openlogsync_logic",
      description: "Use the Aphura Engine (OpenLogSync) to Autonomously deploy Log Aggregation architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_openlogcompiler_logic",
      description: "Use the Aphura Engine (OpenLogCompiler) to Autonomously deploy Log Aggregation architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_openpersistentnexus_logic",
      description: "Use the Aphura Engine (OpenPersistentNexus) to Autonomously deploy Persistent Memory architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_openfederatedvortex_logic",
      description: "Use the Aphura Engine (OpenFederatedVortex) to Autonomously deploy Federated GraphQL architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_opencross-clusterbroker_logic",
      description: "Use the Aphura Engine (OpenCross-ClusterBroker) to Autonomously deploy Cross-Cluster Replication architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_openstaticmesh_logic",
      description: "Use the Aphura Engine (OpenStaticMesh) to Autonomously deploy Static Code Analysis architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_opengraphgrid_logic",
      description: "Use the Aphura Engine (OpenGraphGrid) to Autonomously deploy Graph Neural Networks architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_openeventvault_logic",
      description: "Use the Aphura Engine (OpenEventVault) to Autonomously deploy Event Streaming architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_openfinancialmesh_logic",
      description: "Use the Aphura Engine (OpenFinancialMesh) to Autonomously deploy Financial Ledger State architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_openloggrid_logic",
      description: "Use the Aphura Engine (OpenLogGrid) to Autonomously deploy Log Aggregation architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_openautomatedproxy_logic",
      description: "Use the Aphura Engine (OpenAutomatedProxy) to Autonomously deploy Automated Load Balancing architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_openmulti-partyrouter_logic",
      description: "Use the Aphura Engine (OpenMulti-PartyRouter) to Autonomously deploy Multi-Party Computation architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_openautomatedrouter_logic",
      description: "Use the Aphura Engine (OpenAutomatedRouter) to Autonomously deploy Automated Load Balancing architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_opendatanexus_logic",
      description: "Use the Aphura Engine (OpenDataNexus) to Autonomously deploy Data Lineage architectures across massive enterprise OpenStack clusters.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_seaweedfs_cluster",
      description: "Use the Aphura Engine (SeaweedFS) to Deploy hyper-fast, distributed file systems for billions of small files and images.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_openebs_cas",
      description: "Use the Aphura Engine (OpenEBS) to Deploy container-attached storage architecture for stateful microservices.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_longhorn_volumes",
      description: "Use the Aphura Engine (Longhorn) to Provision highly available, distributed block storage for Kubernetes persistent volumes.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_ozone_object_store",
      description: "Use the Aphura Engine (Apache Ozone) to Deploy highly scalable object stores for massive Data Lake architectures.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "orchestrate_rook_storage",
      description: "Use the Aphura Engine (Rook) to Autonomously orchestrate distributed storage systems natively within Kubernetes.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_bookkeeper_wal",
      description: "Use the Aphura Engine (Apache BookKeeper) to Deploy distributed, fault-tolerant write-ahead logging streams for data consistency.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "route_rocketmq_finance",
      description: "Use the Aphura Engine (Apache RocketMQ) to Execute low-latency, high-reliability message routing for financial transaction architectures.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_activemq_broker",
      description: "Use the Aphura Engine (Apache ActiveMQ) to Provision enterprise-grade multi-protocol message brokers.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_nats_mesh",
      description: "Use the Aphura Engine (NATS) to Deploy hyper-fast, lightweight distributed messaging nervous systems for edge microservices.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_pulsar_cluster",
      description: "Use the Aphura Engine (Apache Pulsar) to Deploy geo-replicated pub-sub messaging systems capable of handling millions of events per second.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_skywalking_apm",
      description: "Use the Aphura Engine (Apache SkyWalking) to Provision Application Performance Monitoring (APM) for distributed mesh architectures.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "route_fluentbit_logs",
      description: "Use the Aphura Engine (Fluent Bit) to Autonomously collect, parse, and route massive log streams across the Kubernetes cluster.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_zipkin_latency",
      description: "Use the Aphura Engine (Zipkin) to Execute timing analysis across distributed systems to identify latency bottlenecks.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_jaeger_tracing",
      description: "Use the Aphura Engine (Jaeger) to Deploy distributed tracing backends to visualize and troubleshoot complex microservice transactions.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "instrument_opentelemetry",
      description: "Use the Aphura Engine (OpenTelemetry) to Autonomously instrument microservices for distributed tracing and telemetry collection.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_ninja_build",
      description: "Use the Aphura Engine (Ninja Build) to Orchestrate the compilation of massive C/C++ architectures at blistering speeds via maximum CPU parallelization.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_clang_ast",
      description: "Use the Aphura Engine (Clang) to Execute deep static analysis on massive C/C++ codebases to find memory leaks before execution.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compile_emscripten_wasm",
      description: "Use the Aphura Engine (Emscripten) to Autonomously compile legacy C/C++ architectures into WebAssembly for native browser execution.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "parse_treesitter_ast",
      description: "Use the Aphura Engine (Tree-sitter) to Instantly generate ASTs for any programming language to execute deep, context-aware code refactoring.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compile_llvm_language",
      description: "Use the Aphura Engine (LLVM) to Autonomously invent, define, and compile entirely new programming languages from scratch.",
      parameters: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
    }
  },
  {
    type: "function",
    function: {
      name: "enforce_network_security_policy",
      description: "Use the Aphura Network Security Engine (Calico) to autonomously deploy complex eBPF data planes and BGP routing protocols, dictating exact Zero-Trust communication rules across massive Kubernetes clusters.",
      parameters: { type: "object", properties: { policyYaml: { type: "string" } }, required: ["policyYaml"] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_physical_infrastructure",
      description: "Use the Aphura Universal Control Plane Engine (Crossplane) to bypass standard IaC tools and use Kubernetes to autonomously provision raw, bare-metal physical servers directly from the OpenStack API.",
      parameters: { type: "object", properties: { resourceYaml: { type: "string" } }, required: ["resourceYaml"] }
    }
  },
  {
    type: "function",
    function: {
      name: "register_internal_dns",
      description: "Use the Aphura DNS Engine (CoreDNS) to autonomously map dynamic IPs to stable internal domains, allowing thousands of scaling microservices to instantly discover each other.",
      parameters: { type: "object", properties: { serviceName: { type: "string" }, internalIp: { type: "string" } }, required: ["serviceName", "internalIp"] }
    }
  },
  {
    type: "function",
    function: {
      name: "configure_prometheus_metrics",
      description: "Use the Aphura Time-Series Engine (Prometheus) to autonomously configure metric scrapers, tracking millions of cloud-native data points across the OpenStack cluster to predict failures before they happen.",
      parameters: { type: "object", properties: { targetService: { type: "string" } }, required: ["targetService"] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_grpc_channel",
      description: "Use the Aphura RPC Engine (gRPC) to autonomously compile Protobuf definitions and deploy hyper-fast, binary-encoded inter-service communication channels, completely bypassing standard REST latency.",
      parameters: { type: "object", properties: { protoFile: { type: "string" }, serviceName: { type: "string" } }, required: ["protoFile", "serviceName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "configure_iceberg_tables",
      description: "Use the Aphura Open Table Engine (Apache Iceberg) to bring SQL-like reliability and ACID transactions to massive Data Lakes, allowing multiple analytical engines to query Petabytes of data concurrently without locking.",
      parameters: { type: "object", properties: { dataLakePath: { type: "string" } }, required: ["dataLakePath"] }
    }
  },
  {
    type: "function",
    function: {
      name: "route_enterprise_data",
      description: "Use the Aphura Data Routing Engine (Apache NiFi) to autonomously wire, route, and transform massive data flows between thousands of disconnected enterprise systems with perfect guaranteed delivery.",
      parameters: { type: "object", properties: { sourceSystem: { type: "string" }, destinationSystem: { type: "string" } }, required: ["sourceSystem", "destinationSystem"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_unified_etl_pipeline",
      description: "Use the Aphura Unified Data Engine (Apache Beam) to autonomously author and deploy complex ETL pipelines that can process massive static batch files and real-time streaming data simultaneously.",
      parameters: { type: "object", properties: { pipelineName: { type: "string" } }, required: ["pipelineName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_spark_analytics",
      description: "Use the Aphura Analytics Engine (Apache Spark) to autonomously distribute and execute extremely fast Data Science operations (like MapReduce or ML training) entirely in-memory across the cluster.",
      parameters: { type: "object", properties: { jobType: { type: "string" }, datasetUrl: { type: "string" } }, required: ["jobType", "datasetUrl"] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_hadoop_hdfs",
      description: "Use the Aphura Distributed Storage Engine (Apache Hadoop) to autonomously orchestrate massive HDFS clusters capable of securely storing Exabytes of unstructured enterprise data across OpenStack.",
      parameters: { type: "object", properties: { clusterName: { type: "string" }, datanodeCount: { type: "number" } }, required: ["clusterName", "datanodeCount"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_in_memory_vector_search",
      description: "Use the Aphura Similarity Search Engine (FAISS) to execute hyper-fast, localized in-memory vector similarity searches, bypassing heavy database lookups for instant semantic context retrieval.",
      parameters: { type: "object", properties: { vectorQuery: { type: "string" } }, required: ["vectorQuery"] }
    }
  },
  {
    type: "function",
    function: {
      name: "manipulate_llm_tensors",
      description: "Use the Aphura Low-Level LLM Engine (Transformers) to gain direct architectural access to tokenizers, allowing meticulous compression and formatting of input tensors before they are sent to the AI Inference cloud.",
      parameters: { type: "object", properties: { textPayload: { type: "string" } }, required: ["textPayload"] }
    }
  },
  {
    type: "function",
    function: {
      name: "structure_rag_index",
      description: "Use the Aphura Advanced RAG Framework (LlamaIndex) to autonomously ingest, chunk, and structure massive enterprise document datasets into highly optimized semantic graphs specifically formatted for LLM consumption.",
      parameters: { type: "object", properties: { corpusSource: { type: "string" } }, required: ["corpusSource"] }
    }
  },
  {
    type: "function",
    function: {
      name: "wire_langchain_graph",
      description: "Use the Aphura AI Orchestration Engine (LangChain) to autonomously wire multiple disparate LLMs together (e.g. Vision -> Text -> Code) to solve extremely complex multi-step reasoning problems.",
      parameters: { type: "object", properties: { taskGoal: { type: "string" }, agentNodes: { type: "array", items: { type: "string" } } }, required: ["taskGoal", "agentNodes"] }
    }
  },
  {
    type: "function",
    function: {
      name: "orchestrate_vllm_engine",
      description: "Use the Aphura Inference Engine (vLLM) to autonomously deploy PagedAttention memory grids, maximizing the concurrency and token-throughput of external AI models by 10x.",
      parameters: { type: "object", properties: { modelName: { type: "string" }, batchSize: { type: "number" } }, required: ["modelName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "synchronize_cluster_state",
      description: "Use the Aphura Synchronization Engine (Apache ZooKeeper) to autonomously coordinate, name, and synchronize configuration states across tens of thousands of distributed microservices instantly.",
      parameters: { type: "object", properties: { serviceRegistry: { type: "string" } }, required: ["serviceRegistry"] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_transactional_kv_store",
      description: "Use the Aphura Transactional KV Engine (TiKV) to autonomously deploy distributed, strongly consistent key-value stores capable of safely processing millions of financial or e-commerce transactions without data corruption.",
      parameters: { type: "object", properties: { namespace: { type: "string" } }, required: ["namespace"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_ignite_memory_grid",
      description: "Use the Aphura In-Memory Engine (Apache Ignite) to autonomously cache massive databases entirely in RAM across thousands of OpenStack nodes, delivering microsecond-latency data retrieval.",
      parameters: { type: "object", properties: { datasetName: { type: "string" }, memorySizeGb: { type: "number" } }, required: ["datasetName", "memorySizeGb"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_presto_query",
      description: "Use the Aphura Distributed SQL Engine (Presto) to autonomously distribute and execute extremely complex SQL queries across Petabytes of raw OpenStack Data Lakes in seconds.",
      parameters: { type: "object", properties: { sqlQuery: { type: "string" }, dataLakePath: { type: "string" } }, required: ["sqlQuery", "dataLakePath"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_cassandra_ring",
      description: "Use the Aphura Planetary NoSQL Engine (Apache Cassandra) to autonomously orchestrate massive, multi-datacenter database rings with zero single points of failure.",
      parameters: { type: "object", properties: { keyspace: { type: "string" }, nodes: { type: "number" } }, required: ["keyspace", "nodes"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compile_2d_webgl_canvas",
      description: "Use the Aphura 2D Rendering Engine (PixiJS) to autonomously compile lightning-fast WebGL canvases capable of rendering 100,000 interactive sprites and particle systems at a perfect 60 FPS.",
      parameters: { type: "object", properties: { canvasDescription: { type: "string" } }, required: ["canvasDescription"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compile_webgpu_scene",
      description: "Use the Aphura AAA Graphics Engine (Babylon.js) to autonomously compile and render physically-based, hyper-realistic 3D scenes directly in the browser via native WebGPU.",
      parameters: { type: "object", properties: { sceneDescription: { type: "string" } }, required: ["sceneDescription"] }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_multithreaded_collisions",
      description: "Use the Aphura Rigid Body Engine (Jolt Physics) to mathematically calculate massive, multithreaded collision events for millions of physical objects simultaneously.",
      parameters: { type: "object", properties: { objectCount: { type: "number" } }, required: ["objectCount"] }
    }
  },
  {
    type: "function",
    function: {
      name: "simulate_advanced_physics",
      description: "Use the Aphura Physics Engine (MuJoCo) to autonomously construct and simulate highly advanced biomechanical joint constraints and contact dynamics for AI reinforcement learning.",
      parameters: { type: "object", properties: { modelXml: { type: "string" } }, required: ["modelXml"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compile_game_binary",
      description: "Use the Aphura Game Compilation Engine (Godot) to autonomously pack 2D/3D assets and scripts into a fully playable, native game binary.",
      parameters: { type: "object", properties: { projectPath: { type: "string" }, targetPlatform: { type: "string" } }, required: ["projectPath", "targetPlatform"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_edge_vision",
      description: "Use the Aphura Edge AI Engine (MediaPipe) to autonomously deploy ultra-fast, on-device machine learning vision pipelines (like 3D hand tracking or pose estimation) that run entirely offline without cloud servers.",
      parameters: { type: "object", properties: { trackingMode: { type: "string" } }, required: ["trackingMode"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compile_embedded_firmware",
      description: "Use the Aphura Hardware Build Engine (PlatformIO) to autonomously resolve complex C/C++ dependencies and compile firmware binaries for thousands of physical IoT boards (Arduino, ESP32, STM32).",
      parameters: { type: "object", properties: { boardType: { type: "string" } }, required: ["boardType"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compile_ml_to_hardware",
      description: "Use the Aphura Hardware Compiler Engine (Apache TVM) to autonomously compile raw deep learning models directly into optimized bare-metal instructions for CPUs, GPUs, or specialized AI accelerators.",
      parameters: { type: "object", properties: { modelArch: { type: "string" }, hardwareTarget: { type: "string" } }, required: ["modelArch", "hardwareTarget"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compile_freertos_firmware",
      description: "Use the Aphura Microcontroller Engine (FreeRTOS) to autonomously compile sub-millisecond, real-time preemptive firmware tasks for physical IoT Edge devices.",
      parameters: { type: "object", properties: { taskDescription: { type: "string" } }, required: ["taskDescription"] }
    }
  },
  {
    type: "function",
    function: {
      name: "simulate_quantum_circuit",
      description: "Use the Aphura Quantum Engine (Qiskit) to autonomously author, compile, and simulate complex Quantum Circuits for cryptographic or molecular algorithms.",
      parameters: { type: "object", properties: { circuitDescription: { type: "string" } }, required: ["circuitDescription"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compile_tailwind_css",
      description: "Use the Aphura Styling Engine (Tailwind CSS) to autonomously scan HTML architectures and compile perfectly optimized, pixel-perfect CSS stylesheets.",
      parameters: { type: "object", properties: { htmlContent: { type: "string" } }, required: ["htmlContent"] }
    }
  },
  {
    type: "function",
    function: {
      name: "run_ui_automation_test",
      description: "Use the Aphura QA Engine (Appium) to autonomously launch iOS/Android emulators and simulate human tapping, swiping, and typing to validate cross-platform UI flows.",
      parameters: { type: "object", properties: { appBinaryPath: { type: "string" }, testScript: { type: "string" } }, required: ["appBinaryPath", "testScript"] }
    }
  },
  {
    type: "function",
    function: {
      name: "inject_native_hardware_bridge",
      description: "Use the Aphura Native Bridge Engine (Capacitor) to seamlessly bind standard web applications to native mobile hardware components like the Camera, GPS, or Accelerometer.",
      parameters: { type: "object", properties: { webAppPath: { type: "string" }, targetHardware: { type: "array", items: { type: "string" } } }, required: ["webAppPath", "targetHardware"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compile_desktop_app",
      description: "Use the Aphura Desktop Engine (Tauri) to securely package web applications into hyper-fast, lightweight native Rust executables for Windows, macOS, or Linux.",
      parameters: { type: "object", properties: { webAppPath: { type: "string" }, osTarget: { type: "string", enum: ["Windows", "macOS", "Linux"] } }, required: ["webAppPath", "osTarget"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compile_mobile_app",
      description: "Use the Aphura Mobile OS Engine (React Native) to autonomously compile JavaScript codebases into native, installable iOS (.ipa) and Android (.apk) binaries.",
      parameters: { type: "object", properties: { projectName: { type: "string" }, targetOs: { type: "string", enum: ["iOS", "Android"] } }, required: ["projectName", "targetOs"] }
    }
  },
  {
    type: "function",
    function: {
      name: "transpile_typescript_esbuild",
      description: "Use the Aphura Extreme-Speed Bundler (ESBuild) to bypass Node.js entirely and compile massive TypeScript projects using Go-native threads 100x faster than traditional tools.",
      parameters: { type: "object", properties: { entryFile: { type: "string" } }, required: ["entryFile"] }
    }
  },
  {
    type: "function",
    function: {
      name: "bundle_frontend_vite",
      description: "Use the Aphura Frontend Engine (Vite) to autonomously compile, bundle, and hot-reload massive React/Vue architectures in milliseconds using native ES modules.",
      parameters: { type: "object", properties: { repoPath: { type: "string" } }, required: ["repoPath"] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_nix_environment",
      description: "Use the Aphura OS Engine (Nix) to autonomously deploy mathematically reproducible development environments, eliminating the it-works-on-my-machine problem entirely.",
      parameters: { type: "object", properties: { flakeConfig: { type: "string" } }, required: ["flakeConfig"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_bazel_build",
      description: "Use the Aphura Monorepo Build Engine (Bazel) to autonomously compile massive, multi-language codebases with high cache-hit ratios.",
      parameters: { type: "object", properties: { targetPath: { type: "string" } }, required: ["targetPath"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_cicd_pipeline",
      description: "Use the Aphura CI/CD Engine (Drone) to autonomously execute container-native testing and deployment pipelines.",
      parameters: { type: "object", properties: { repoUrl: { type: "string" }, pipelineYaml: { type: "string" } }, required: ["repoUrl", "pipelineYaml"] }
    }
  },
  {
    type: "function",
    function: {
      name: "spin_up_binder_env",
      description: "Use the Aphura Cloud Notebook Engine (BinderHub) to autonomously convert any GitHub repository into a live, executable Jupyter environment running in the browser.",
      parameters: { type: "object", properties: { repoUrl: { type: "string" } }, required: ["repoUrl"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_distributed_ray_job",
      description: "Use the Aphura Distributed Compute Engine (Ray) to autonomously parallelize massive Python tasks across thousands of cloud CPU cores for hyper-fast execution.",
      parameters: { type: "object", properties: { jobName: { type: "string" }, cores: { type: "number" } }, required: ["jobName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "track_model_mlflow",
      description: "Use the Aphura MLOps Engine (MLflow) to autonomously track, version control, and deploy specialized machine learning models and fine-tuning adapters.",
      parameters: { type: "object", properties: { modelName: { type: "string" }, metrics: { type: "object" } }, required: ["modelName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_airflow_dag",
      description: "Use the Aphura Pipeline Engine (Apache Airflow) to autonomously author and deploy massive, cron-based workflows and ETL DAGs that run continuously in the background.",
      parameters: { type: "object", properties: { dagName: { type: "string" }, cronSchedule: { type: "string" } }, required: ["dagName", "cronSchedule"] }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_plotly_chart",
      description: "Use the Aphura Data Visualization Engine (Plotly) to autonomously compile and render complex, interactive 2D and 3D data visualizations directly in the UI.",
      parameters: { type: "object", properties: { dataset: { type: "string" }, chartType: { type: "string" } }, required: ["dataset", "chartType"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_node_rpc",
      description: "Use the Aphura Low-Level Node Engine (JSON-RPC) to execute raw byte-level commands directly against Ethereum or Bitcoin nodes.",
      parameters: { type: "object", properties: { nodeUrl: { type: "string" }, method: { type: "string" }, params: { type: "array", items: { type: "string" } } }, required: ["nodeUrl", "method"] }
    }
  },
  {
    type: "function",
    function: {
      name: "spin_up_blockchain_simulator",
      description: "Use the Aphura Web3 Simulation Engine (Ganache) to instantly deploy an in-memory Ethereum blockchain for fast, zero-cost smart contract testing and exploit simulations.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_enterprise_blockchain",
      description: "Use the Aphura Enterprise Blockchain Engine (Hyperledger Fabric) to autonomously architect and deploy private, permissioned blockchain networks for secure enterprise operations.",
      parameters: { type: "object", properties: { networkName: { type: "string" }, nodes: { type: "number" } }, required: ["networkName", "nodes"] }
    }
  },
  {
    type: "function",
    function: {
      name: "encrypt_data_payload",
      description: "Use the Aphura Cryptography Engine (Bouncy Castle) to autonomously generate secure keys and encrypt highly sensitive payloads using military-grade AES-256-GCM algorithms.",
      parameters: { type: "object", properties: { payloadData: { type: "string" } }, required: ["payloadData"] }
    }
  },
  {
    type: "function",
    function: {
      name: "pin_to_ipfs",
      description: "Use the Aphura Decentralized Storage Engine (IPFS) to autonomously upload and pin files or entire web applications to the peer-to-peer IPFS network, generating an immutable CID hash.",
      parameters: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compress_to_parquet",
      description: "Use the Aphura Data Lake Engine (Apache Parquet) to autonomously compress massive raw datasets into highly optimized columnar formats, reducing storage costs by 80%.",
      parameters: { type: "object", properties: { datasetPath: { type: "string" } }, required: ["datasetPath"] }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_graphql_schema",
      description: "Use the Aphura API Engine (Apollo GraphQL) to autonomously introspect databases and instantly compile optimized GraphQL schemas.",
      parameters: { type: "object", properties: { databaseName: { type: "string" } }, required: ["databaseName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "build_text_index",
      description: "Use the Aphura Indexing Engine (Apache Lucene) to autonomously compile low-level inverted indexes across petabytes of raw text for custom search architectures.",
      parameters: { type: "object", properties: { corpusName: { type: "string" } }, required: ["corpusName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_graph_traversal",
      description: "Use the Aphura Graph DB Engine (Apache TinkerPop/Gremlin) to execute complex relationship traversals and map highly connected data structures.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_search_index",
      description: "Use the Aphura Search Engine (Meilisearch) to autonomously deploy hyper-fast, typo-tolerant search indexes across large datasets.",
      parameters: { type: "object", properties: { indexName: { type: "string" } }, required: ["indexName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_visual_flow",
      description: "Use the Aphura IoT Automation Engine (Node-RED) to autonomously wire hardware sensors, APIs, and microservices into a visual flow-based logic graph.",
      parameters: { type: "object", properties: { flowDescription: { type: "string" } }, required: ["flowDescription"] }
    }
  },
  {
    type: "function",
    function: {
      name: "configure_edge_proxy",
      description: "Use the Aphura Edge Security Engine (Envoy Proxy) to autonomously deploy dynamic load balancers, rate-limiters, and Layer 7 DDoS protections.",
      parameters: { type: "object", properties: { domain: { type: "string" }, routingRules: { type: "string" } }, required: ["domain"] }
    }
  },
  {
    type: "function",
    function: {
      name: "compile_to_webassembly",
      description: "Use the Aphura WASM Engine (Wasmtime) to compile heavy C++ or Rust programs into WebAssembly (.wasm) for near-native execution speed directly in the browser.",
      parameters: { type: "object", properties: { sourceCode: { type: "string" }, language: { type: "string" } }, required: ["sourceCode", "language"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_kubernetes_manifest",
      description: "Use the Aphura Orchestration Engine (Kubernetes) to autonomously deploy, scale, and manage massive containerized microservice fleets.",
      parameters: { type: "object", properties: { manifestYaml: { type: "string" } }, required: ["manifestYaml"] }
    }
  },
  {
    type: "function",
    function: {
      name: "build_os_container",
      description: "Use the Aphura Containerization Engine (Containerd) to autonomously package source code and dependencies into standardized, isolated OS containers.",
      parameters: { type: "object", properties: { dockerfileConfig: { type: "string" } }, required: ["dockerfileConfig"] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_data_notebook",
      description: "Use the Aphura Analytics Engine (Apache Zeppelin) to autonomously deploy interactive, multi-language data notebooks for complex data science tasks.",
      parameters: { type: "object", properties: { notebookName: { type: "string" }, languages: { type: "array", items: { type: "string" } } }, required: ["notebookName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "transpile_code_ast",
      description: "Use the Aphura AST Engine (SWC) to perfectly transpile massive codebases from one language to another by directly mapping Abstract Syntax Trees rather than guessing via LLM.",
      parameters: { type: "object", properties: { code: { type: "string" }, targetLanguage: { type: "string" } }, required: ["code", "targetLanguage"] }
    }
  },
  {
    type: "function",
    function: {
      name: "provision_sso_portal",
      description: "Use the Aphura IAM Security Engine (Keycloak) to autonomously deploy enterprise-grade SSO, OAuth2, and 2FA authentication realms for an application.",
      parameters: { type: "object", properties: { domain: { type: "string" }, authType: { type: "string" } }, required: ["domain"] }
    }
  },
  {
    type: "function",
    function: {
      name: "extract_file_metadata",
      description: "Use the Aphura Universal Extraction Engine (Apache Tika) to rip text and hidden metadata from over 1,000 obscure file formats (legacy Office docs, corrupted PDFs, audio headers).",
      parameters: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] }
    }
  },
  {
    type: "function",
    function: {
      name: "track_objects_in_video",
      description: "Use the Aphura Computer Vision Engine (OpenCV) to analyze live video feeds, detect faces, track objects, and extract spatial coordinates.",
      parameters: { type: "object", properties: { videoStreamUrl: { type: "string" }, targetObject: { type: "string" } }, required: ["videoStreamUrl", "targetObject"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_arrow_computation",
      description: "Use the Aphura Compute Engine (Apache Arrow) to execute mathematical operations or queries on massive tabular datasets up to 100x faster than standard Python Pandas by utilizing in-memory columnar formats.",
      parameters: { type: "object", properties: { dataset: { type: "string" }, query: { type: "string" } }, required: ["dataset", "query"] }
    }
  },
  {
    type: "function",
    function: {
      name: "process_data_stream_flink",
      description: "Use the Aphura Stream Processing Engine (Apache Flink) to deploy stateful computation jobs over massive real-time data streams (like stock market tickers or IoT sensors).",
      parameters: { type: "object", properties: { streamSource: { type: "string" }, computationLogic: { type: "string" } }, required: ["streamSource", "computationLogic"] }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_3d_map",
      description: "Use the Aphura Geolocation Engine (MapLibre) to compile and render an interactive 3D map with data overlays directly in the chat UI.",
      parameters: { type: "object", properties: { datasetOverlay: { type: "string" } }, required: ["datasetOverlay"] }
    }
  },
  {
    type: "function",
    function: {
      name: "seed_webtorrent_file",
      description: "Use the Aphura Torrent Engine (WebTorrent) to distribute massive datasets or compiled videos via peer-to-peer streaming directly to the browser.",
      parameters: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] }
    }
  },
  {
    type: "function",
    function: {
      name: "create_matrix_room",
      description: "Use the Aphura Comms Engine (Matrix) to autonomously spin up a decentralized, end-to-end encrypted chat protocol for secure data transfer.",
      parameters: { type: "object", properties: { roomAlias: { type: "string" } }, required: ["roomAlias"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_fleet_patch",
      description: "Use the Aphura Server Fleet Engine (SaltStack) to autonomously SSH into thousands of Linux servers simultaneously and deploy configuration patches or security updates.",
      parameters: { type: "object", properties: { targetFleet: { type: "string" }, patchCommand: { type: "string" } }, required: ["targetFleet", "patchCommand"] }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_3d_webgl_scene",
      description: "Use the Aphura 3D WebGL Engine (Three.js) to autonomously compile and embed interactive 3D scenes directly into the chat UI.",
      parameters: { type: "object", properties: { sceneDescription: { type: "string" } }, required: ["sceneDescription"] }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_bi_dashboard",
      description: "Use the Aphura BI Engine (Apache Superset) to autonomously compile and deploy enterprise-grade, interactive data visualization dashboards.",
      parameters: { type: "object", properties: { datasetId: { type: "string" } }, required: ["datasetId"] }
    }
  },
  {
    type: "function",
    function: {
      name: "create_webrtc_room",
      description: "Use the Aphura Media Engine (LiveKit) to autonomously spin up a low-latency WebRTC video conferencing room.",
      parameters: { type: "object", properties: { roomName: { type: "string" } }, required: ["roomName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "cache_data_valkey",
      description: "Use the Aphura Memory Engine (Valkey) to instantly cache heavy computational results or API payloads in RAM for sub-millisecond global retrieval.",
      parameters: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"] }
    }
  },
  {
    type: "function",
    function: {
      name: "process_image_sharp",
      description: "Use the Aphura Vision Engine (Sharp) to autonomously composite, resize, and optimize massive batches of images into WebP format.",
      parameters: { type: "object", properties: { imageUrl: { type: "string" }, operations: { type: "string" } }, required: ["imageUrl"] }
    }
  },
  {
    type: "function",
    function: {
      name: "publish_kafka_event",
      description: "Use the Aphura Streaming Engine (Apache Kafka) to publish real-time events to distributed message brokers.",
      parameters: { type: "object", properties: { topic: { type: "string" }, payload: { type: "object" } }, required: ["topic", "payload"] }
    }
  },
  {
    type: "function",
    function: {
      name: "blast_marketing_email",
      description: "Use the Aphura Marketing Engine (Nodemailer) to autonomously convert text into beautiful HTML and blast it to massive email lists via SMTP.",
      parameters: { type: "object", properties: { subject: { type: "string" }, markdownContent: { type: "string" }, targetList: { type: "string" } }, required: ["subject", "markdownContent"] }
    }
  },
  {
    type: "function",
    function: {
      name: "run_dbt_transformation",
      description: "Use the Aphura Big Data Engine (dbt Core) to autonomously orchestrate massive SQL transformations and ETL DAGs across data warehouses.",
      parameters: { type: "object", properties: { warehouseUrl: { type: "string" }, sqlLogic: { type: "string" } }, required: ["warehouseUrl", "sqlLogic"] }
    }
  },
  {
    type: "function",
    function: {
      name: "audit_smart_contract",
      description: "Use the Aphura Web3 Engine (Foundry) to compile, fuzz-test, and securely audit Solidity smart contracts for re-entrancy and gas optimization.",
      parameters: { type: "object", properties: { solidityCode: { type: "string" } }, required: ["solidityCode"] }
    }
  },
  {
    type: "function",
    function: {
      name: "test_api_endpoint",
      description: "Use the Aphura API Engine (Hoppscotch) to autonomously probe, execute, and validate REST or GraphQL endpoints.",
      parameters: { type: "object", properties: { endpointUrl: { type: "string" }, method: { type: "string" } }, required: ["endpointUrl"] }
    }
  },
  {
    type: "function",
    function: {
      name: "debug_production_outage",
      description: "Use the Aphura APM Engine (SigNoz) to ingest live server telemetry and automatically diagnose the root cause of a production outage.",
      parameters: { type: "object", properties: { serviceName: { type: "string" } }, required: ["serviceName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_in_microvm",
      description: "Use the Aphura Firecracker Engine to safely execute dangerous or untrusted code inside an isolated MicroVM.",
      parameters: { type: "object", properties: { dangerousCode: { type: "string" } }, required: ["dangerousCode"] }
    }
  },
  {
    type: "function",
    function: {
      name: "deploy_cloud_infrastructure",
      description: "Use the Aphura DevOps Engine (Pulumi) to autonomously write and deploy Infrastructure-as-Code to AWS, GCP, or Azure.",
      parameters: { type: "object", properties: { cloudProvider: { type: "string" }, architectureDesc: { type: "string" } }, required: ["cloudProvider", "architectureDesc"] }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_browser_trace",
      description: "If a standard web interaction fails (e.g., CAPTCHA, hidden element), use the Aphura Browser Tracer to dump the full DOM, network requests, and visual timeline so you can self-correct.",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }
    }
  },
  {
    type: "function",
    function: {
      name: "decompile_binary",
      description: "Use the Aphura Reverse Engineering Engine (Ghidra/Radare2) to rip apart compiled binaries (.exe, .apk) and extract their underlying C/C++ logic.",
      parameters: { type: "object", properties: { binaryPath: { type: "string" } }, required: ["binaryPath"] }
    }
  },
  {
    type: "function",
    function: {
      name: "apply_multiplayer_edits",
      description: "Use the Aphura Yjs Sync Engine to seamlessly inject code edits into a live document that the user is currently typing in, preventing merge conflicts.",
      parameters: { type: "object", properties: { docId: { type: "string" }, edits: { type: "string" } }, required: ["docId", "edits"] }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_interactive_diagram",
      description: "Use the Aphura Diagram Engine (Excalidraw/Mermaid) to generate a rich, interactive visual architecture map or flowchart instead of just outputting text.",
      parameters: { type: "object", properties: { description: { type: "string" }, type: { type: "string", enum: ["architecture", "flowchart", "sequence"] } }, required: ["description"] }
    }
  },
  {
    type: "function",
    function: {
      name: "validate_code_lsp",
      description: "Use the Aphura LSP Bridge to statically analyze, lint, and type-check code in the background to ensure it is 100% error-free before outputting.",
      parameters: { type: "object", properties: { code: { type: "string" }, language: { type: "string" } }, required: ["code", "language"] }
    }
  },
  {
    type: "function",
    function: {
      name: "run_database_migration",
      description: "Use the Aphura Database Engine (Atlas) to safely diff, inspect, and apply declarative schema changes to live production databases.",
      parameters: { type: "object", properties: { targetConnectionString: { type: "string" }, desiredSchema: { type: "string" } }, required: ["targetConnectionString", "desiredSchema"] }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_3d_model",
      description: "Use the Aphura 3D Generation Engine (TripoSR) to create fully textured 3D models (.glb or .obj) from text prompts.",
      parameters: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_audio_track",
      description: "Use the Aphura Generative Audio Engine (MusicGen) to create high-quality songs, ambient tracks, or sound effects from text.",
      parameters: { type: "object", properties: { prompt: { type: "string" }, durationSec: { type: "number" } }, required: ["prompt"] }
    }
  },
  {
    type: "function",
    function: {
      name: "run_security_audit",
      description: "Use the Aphura Cyber-Security Engine (Semgrep) to autonomously scan a codebase for Zero-Day vulnerabilities, SQL injections, or memory leaks.",
      parameters: { type: "object", properties: { repoPath: { type: "string" } }, required: ["repoPath"] }
    }
  },
  {
    type: "function",
    function: {
      name: "query_financial_terminal",
      description: "Query the Aphura OpenBB Financial Engine to retrieve live market data, options chains, crypto order books, or macroeconomic indicators.",
      parameters: { type: "object", properties: { ticker: { type: "string" }, dataClass: { type: "string", enum: ["equity", "crypto", "options", "macro"] } }, required: ["ticker"] }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_video_clip",
      description: "Use the Aphura VideoGen engine (Mochi-1) to generate a short 3-5 second video clip based on a text prompt. Returns a playable CDN URL.",
      parameters: { type: "object", properties: { prompt: { type: "string" }, duration: { type: "number" } }, required: ["prompt"] }
    }
  },
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
        case "execute_openeventproxy_logic": {
          try {
            const { OpeneventproxyService } = await import("../enterprise/openeventproxy.service.js");
            const res = await OpeneventproxyService.execute(args.target || "system");
            return { output: `### OpenEventProxy Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenEventProxy failed: ${err.message}` };
          }
        }
        case "execute_openlogsync_logic": {
          try {
            const { OpenlogsyncService } = await import("../enterprise/openlogsync.service.js");
            const res = await OpenlogsyncService.execute(args.target || "system");
            return { output: `### OpenLogSync Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenLogSync failed: ${err.message}` };
          }
        }
        case "execute_openlogcompiler_logic": {
          try {
            const { OpenlogcompilerService } = await import("../enterprise/openlogcompiler.service.js");
            const res = await OpenlogcompilerService.execute(args.target || "system");
            return { output: `### OpenLogCompiler Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenLogCompiler failed: ${err.message}` };
          }
        }
        case "execute_openpersistentnexus_logic": {
          try {
            const { OpenpersistentnexusService } = await import("../enterprise/openpersistentnexus.service.js");
            const res = await OpenpersistentnexusService.execute(args.target || "system");
            return { output: `### OpenPersistentNexus Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenPersistentNexus failed: ${err.message}` };
          }
        }
        case "execute_openfederatedvortex_logic": {
          try {
            const { OpenfederatedvortexService } = await import("../enterprise/openfederatedvortex.service.js");
            const res = await OpenfederatedvortexService.execute(args.target || "system");
            return { output: `### OpenFederatedVortex Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenFederatedVortex failed: ${err.message}` };
          }
        }
        case "execute_opencross-clusterbroker_logic": {
          try {
            const { Opencross-clusterbrokerService } = await import("../enterprise/opencross-clusterbroker.service.js");
            const res = await Opencross-clusterbrokerService.execute(args.target || "system");
            return { output: `### OpenCross-ClusterBroker Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenCross-ClusterBroker failed: ${err.message}` };
          }
        }
        case "execute_openstaticmesh_logic": {
          try {
            const { OpenstaticmeshService } = await import("../enterprise/openstaticmesh.service.js");
            const res = await OpenstaticmeshService.execute(args.target || "system");
            return { output: `### OpenStaticMesh Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenStaticMesh failed: ${err.message}` };
          }
        }
        case "execute_opengraphgrid_logic": {
          try {
            const { OpengraphgridService } = await import("../enterprise/opengraphgrid.service.js");
            const res = await OpengraphgridService.execute(args.target || "system");
            return { output: `### OpenGraphGrid Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenGraphGrid failed: ${err.message}` };
          }
        }
        case "execute_openeventvault_logic": {
          try {
            const { OpeneventvaultService } = await import("../enterprise/openeventvault.service.js");
            const res = await OpeneventvaultService.execute(args.target || "system");
            return { output: `### OpenEventVault Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenEventVault failed: ${err.message}` };
          }
        }
        case "execute_openfinancialmesh_logic": {
          try {
            const { OpenfinancialmeshService } = await import("../enterprise/openfinancialmesh.service.js");
            const res = await OpenfinancialmeshService.execute(args.target || "system");
            return { output: `### OpenFinancialMesh Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenFinancialMesh failed: ${err.message}` };
          }
        }
        case "execute_openloggrid_logic": {
          try {
            const { OpenloggridService } = await import("../enterprise/openloggrid.service.js");
            const res = await OpenloggridService.execute(args.target || "system");
            return { output: `### OpenLogGrid Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenLogGrid failed: ${err.message}` };
          }
        }
        case "execute_openautomatedproxy_logic": {
          try {
            const { OpenautomatedproxyService } = await import("../enterprise/openautomatedproxy.service.js");
            const res = await OpenautomatedproxyService.execute(args.target || "system");
            return { output: `### OpenAutomatedProxy Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenAutomatedProxy failed: ${err.message}` };
          }
        }
        case "execute_openmulti-partyrouter_logic": {
          try {
            const { Openmulti-partyrouterService } = await import("../enterprise/openmulti-partyrouter.service.js");
            const res = await Openmulti-partyrouterService.execute(args.target || "system");
            return { output: `### OpenMulti-PartyRouter Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenMulti-PartyRouter failed: ${err.message}` };
          }
        }
        case "execute_openautomatedrouter_logic": {
          try {
            const { OpenautomatedrouterService } = await import("../enterprise/openautomatedrouter.service.js");
            const res = await OpenautomatedrouterService.execute(args.target || "system");
            return { output: `### OpenAutomatedRouter Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenAutomatedRouter failed: ${err.message}` };
          }
        }
        case "execute_opendatanexus_logic": {
          try {
            const { OpendatanexusService } = await import("../enterprise/opendatanexus.service.js");
            const res = await OpendatanexusService.execute(args.target || "system");
            return { output: `### OpenDataNexus Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenDataNexus failed: ${err.message}` };
          }
        }
        case "deploy_seaweedfs_cluster": {
          try {
            const { SeaweedfsService } = await import("../data/seaweedfs.service.js");
            const res = await SeaweedfsService.execute(args.target || "system");
            return { output: `### SeaweedFS Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `SeaweedFS failed: ${err.message}` };
          }
        }
        case "deploy_openebs_cas": {
          try {
            const { OpenebsService } = await import("../devops/openebs.service.js");
            const res = await OpenebsService.execute(args.target || "system");
            return { output: `### OpenEBS Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenEBS failed: ${err.message}` };
          }
        }
        case "provision_longhorn_volumes": {
          try {
            const { LonghornService } = await import("../devops/longhorn.service.js");
            const res = await LonghornService.execute(args.target || "system");
            return { output: `### Longhorn Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Longhorn failed: ${err.message}` };
          }
        }
        case "deploy_ozone_object_store": {
          try {
            const { OzoneService } = await import("../data/ozone.service.js");
            const res = await OzoneService.execute(args.target || "system");
            return { output: `### Apache Ozone Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Apache Ozone failed: ${err.message}` };
          }
        }
        case "orchestrate_rook_storage": {
          try {
            const { RookService } = await import("../devops/rook.service.js");
            const res = await RookService.execute(args.target || "system");
            return { output: `### Rook Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Rook failed: ${err.message}` };
          }
        }
        case "deploy_bookkeeper_wal": {
          try {
            const { BookkeeperService } = await import("../data/bookkeeper.service.js");
            const res = await BookkeeperService.execute(args.target || "system");
            return { output: `### Apache BookKeeper Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Apache BookKeeper failed: ${err.message}` };
          }
        }
        case "route_rocketmq_finance": {
          try {
            const { RocketmqService } = await import("../data/rocketmq.service.js");
            const res = await RocketmqService.execute(args.target || "system");
            return { output: `### Apache RocketMQ Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Apache RocketMQ failed: ${err.message}` };
          }
        }
        case "provision_activemq_broker": {
          try {
            const { ActivemqService } = await import("../data/activemq.service.js");
            const res = await ActivemqService.execute(args.target || "system");
            return { output: `### Apache ActiveMQ Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Apache ActiveMQ failed: ${err.message}` };
          }
        }
        case "deploy_nats_mesh": {
          try {
            const { NatsService } = await import("../data/nats.service.js");
            const res = await NatsService.execute(args.target || "system");
            return { output: `### NATS Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `NATS failed: ${err.message}` };
          }
        }
        case "deploy_pulsar_cluster": {
          try {
            const { PulsarService } = await import("../data/pulsar.service.js");
            const res = await PulsarService.execute(args.target || "system");
            return { output: `### Apache Pulsar Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Apache Pulsar failed: ${err.message}` };
          }
        }
        case "provision_skywalking_apm": {
          try {
            const { SkywalkingService } = await import("../devops/skywalking.service.js");
            const res = await SkywalkingService.execute(args.target || "system");
            return { output: `### Apache SkyWalking Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Apache SkyWalking failed: ${err.message}` };
          }
        }
        case "route_fluentbit_logs": {
          try {
            const { FluentbitService } = await import("../devops/fluentbit.service.js");
            const res = await FluentbitService.execute(args.target || "system");
            return { output: `### Fluent Bit Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Fluent Bit failed: ${err.message}` };
          }
        }
        case "analyze_zipkin_latency": {
          try {
            const { ZipkinService } = await import("../devops/zipkin.service.js");
            const res = await ZipkinService.execute(args.target || "system");
            return { output: `### Zipkin Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Zipkin failed: ${err.message}` };
          }
        }
        case "deploy_jaeger_tracing": {
          try {
            const { JaegerService } = await import("../devops/jaeger.service.js");
            const res = await JaegerService.execute(args.target || "system");
            return { output: `### Jaeger Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Jaeger failed: ${err.message}` };
          }
        }
        case "instrument_opentelemetry": {
          try {
            const { OpentelemetryService } = await import("../devops/opentelemetry.service.js");
            const res = await OpentelemetryService.execute(args.target || "system");
            return { output: `### OpenTelemetry Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenTelemetry failed: ${err.message}` };
          }
        }
        case "execute_ninja_build": {
          try {
            const { NinjaService } = await import("../devops/ninja.service.js");
            const res = await NinjaService.execute(args.target || "system");
            return { output: `### Ninja Build Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Ninja Build failed: ${err.message}` };
          }
        }
        case "analyze_clang_ast": {
          try {
            const { ClangService } = await import("../ide/clang.service.js");
            const res = await ClangService.execute(args.target || "system");
            return { output: `### Clang Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Clang failed: ${err.message}` };
          }
        }
        case "compile_emscripten_wasm": {
          try {
            const { EmscriptenService } = await import("../ide/emscripten.service.js");
            const res = await EmscriptenService.execute(args.target || "system");
            return { output: `### Emscripten Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Emscripten failed: ${err.message}` };
          }
        }
        case "parse_treesitter_ast": {
          try {
            const { TreesitterService } = await import("../ide/treesitter.service.js");
            const res = await TreesitterService.execute(args.target || "system");
            return { output: `### Tree-sitter Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Tree-sitter failed: ${err.message}` };
          }
        }
        case "compile_llvm_language": {
          try {
            const { LlvmService } = await import("../ide/llvm.service.js");
            const res = await LlvmService.execute(args.target || "system");
            return { output: `### LLVM Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `LLVM failed: ${err.message}` };
          }
        }
        case "enforce_network_security_policy": {
          try {
            const { CalicoService } = await import("../security/calico.service.js");
            const res = await CalicoService.enforceNetworkPolicy(args.policyYaml);
            return { output: `### Network Security Policy Enforced\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Calico enforcement failed: ${err.message}` };
          }
        }        case "provision_physical_infrastructure": {
          try {
            const { CrossplaneService } = await import("../devops/crossplane.service.js");
            const res = await CrossplaneService.provisionInfrastructure(args.resourceYaml);
            return { output: `### Physical Infrastructure Provisioned\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Crossplane provisioning failed: ${err.message}` };
          }
        }        case "register_internal_dns": {
          try {
            const { CoreDNSService } = await import("../devops/coredns.service.js");
            const res = await CoreDNSService.registerServiceDomain(args.serviceName, args.internalIp);
            return { output: `### Internal DNS Registered\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `DNS registration failed: ${err.message}` };
          }
        }        case "configure_prometheus_metrics": {
          try {
            const { PrometheusService } = await import("../devops/prometheus.service.js");
            const res = await PrometheusService.configureMetricsTarget(args.targetService);
            return { output: `### Prometheus Metrics Configured\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Prometheus configuration failed: ${err.message}` };
          }
        }        case "provision_grpc_channel": {
          try {
            const { GrpcService } = await import("../api/grpc.service.js");
            const res = await GrpcService.provisionGrpcChannel(args.protoFile, args.serviceName);
            return { output: `### gRPC Channel Deployed\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `gRPC provisioning failed: ${err.message}` };
          }
        }        case "configure_iceberg_tables": {
          try {
            const { IcebergService } = await import("../data/iceberg.service.js");
            const res = await IcebergService.configureTableFormat(args.dataLakePath);
            return { output: `### Iceberg Data Lake Active\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Iceberg configuration failed: ${err.message}` };
          }
        }        case "route_enterprise_data": {
          try {
            const { NiFiService } = await import("../data/nifi.service.js");
            const res = await NiFiService.configureDataFlow(args.sourceSystem, args.destinationSystem);
            return { output: `### NiFi Routing Configured\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `NiFi failed: ${err.message}` };
          }
        }        case "deploy_unified_etl_pipeline": {
          try {
            const { BeamService } = await import("../data/beam.service.js");
            const res = await BeamService.deployUnifiedPipeline(args.pipelineName);
            return { output: `### Beam Pipeline Deployed\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Beam deployment failed: ${err.message}` };
          }
        }        case "execute_spark_analytics": {
          try {
            const { SparkService } = await import("../data/spark.service.js");
            const res = await SparkService.executeSparkJob(args.jobType, args.datasetUrl);
            return { output: `### Spark Analytics Result\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Spark failed: ${err.message}` };
          }
        }        case "provision_hadoop_hdfs": {
          try {
            const { HadoopService } = await import("../data/hadoop.service.js");
            const res = await HadoopService.provisionHdfs(args.clusterName, args.datanodeCount);
            return { output: `### Hadoop HDFS Deployed\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Hadoop provisioning failed: ${err.message}` };
          }
        }        case "execute_in_memory_vector_search": {
          try {
            const { FaissService } = await import("../data/faiss.service.js");
            const res = await FaissService.searchVectorSpace(args.vectorQuery);
            return { output: `### FAISS Search Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `FAISS search failed: ${err.message}` };
          }
        }        case "manipulate_llm_tensors": {
          try {
            const { TransformersService } = await import("../ai/transformers.service.js");
            const res = await TransformersService.manipulateTensors(args.textPayload);
            return { output: `### Tensor Formatting Complete\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Transformers failed: ${err.message}` };
          }
        }        case "structure_rag_index": {
          try {
            const { LlamaIndexService } = await import("../rag/llamaindex.service.js");
            const res = await LlamaIndexService.indexEnterpriseData(args.corpusSource);
            return { output: `### RAG Index Built\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `LlamaIndex failed: ${err.message}` };
          }
        }        case "wire_langchain_graph": {
          try {
            const { LangChainService } = await import("../ai/langchain.service.js");
            const res = await LangChainService.chainAgents(args.taskGoal, args.agentNodes);
            return { output: `### AI Graph Wired\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `LangChain error: ${err.message}` };
          }
        }        case "orchestrate_vllm_engine": {
          try {
            const { VllmService } = await import("../ai/vllm.service.js");
            const res = await VllmService.orchestratePagedAttention(args.modelName, args.batchSize || 1024);
            return { output: `### vLLM PagedAttention Configured\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `vLLM setup failed: ${err.message}` };
          }
        }        case "synchronize_cluster_state": {
          try {
            const { ZooKeeperService } = await import("../devops/zookeeper.service.js");
            const res = await ZooKeeperService.synchronizeState(args.serviceRegistry);
            return { output: `### ZooKeeper Cluster Sync\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `ZooKeeper sync failed: ${err.message}` };
          }
        }        case "provision_transactional_kv_store": {
          try {
            const { TiKVService } = await import("../data/tikv.service.js");
            const res = await TiKVService.provisionKVStore(args.namespace);
            return { output: `### TiKV Store Deployed\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `TiKV provisioning failed: ${err.message}` };
          }
        }        case "deploy_ignite_memory_grid": {
          try {
            const { IgniteService } = await import("../data/ignite.service.js");
            const res = await IgniteService.deployMemoryGrid(args.datasetName, args.memorySizeGb);
            return { output: `### In-Memory Grid Deployed\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Ignite deployment failed: ${err.message}` };
          }
        }        case "execute_presto_query": {
          try {
            const { PrestoService } = await import("../data/presto.service.js");
            const res = await PrestoService.executeQuery(args.sqlQuery, args.dataLakePath);
            return { output: `### Presto Query Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Presto query failed: ${err.message}` };
          }
        }        case "deploy_cassandra_ring": {
          try {
            const { CassandraService } = await import("../data/cassandra.service.js");
            const res = await CassandraService.provisionRing(args.keyspace, args.nodes);
            return { output: `### Cassandra Ring Deployed\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Cassandra deployment failed: ${err.message}` };
          }
        }        case "compile_2d_webgl_canvas": {
          try {
            const { PixiService } = await import("../ui/pixi.service.js");
            const res = await PixiService.renderCanvas(args.canvasDescription);
            return { output: `### 2D WebGL Canvas Compiled\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `PixiJS compilation failed: ${err.message}` };
          }
        }        case "compile_webgpu_scene": {
          try {
            const { BabylonService } = await import("../ui/babylon.service.js");
            const res = await BabylonService.renderScene(args.sceneDescription);
            return { output: `### WebGPU Graphics Compiled\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Babylon compile failed: ${err.message}` };
          }
        }        case "calculate_multithreaded_collisions": {
          try {
            const { JoltService } = await import("../simulation/jolt.service.js");
            const res = await JoltService.calculateCollisions(args.objectCount);
            return { output: `### Rigid Body Collision Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Jolt failed: ${err.message}` };
          }
        }        case "simulate_advanced_physics": {
          try {
            const { MuJoCoService } = await import("../simulation/mujoco.service.js");
            const res = await MuJoCoService.simulatePhysics(args.modelXml);
            return { output: `### MuJoCo Physics Simulation\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `MuJoCo simulation failed: ${err.message}` };
          }
        }        case "compile_game_binary": {
          try {
            const { GodotService } = await import("../gaming/godot.service.js");
            const res = await GodotService.compileGame(args.projectPath, args.targetPlatform);
            return { output: `### Game Binary Compiled\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Godot compile failed: ${err.message}` };
          }
        }        case "deploy_edge_vision": {
          try {
            const { MediaPipeService } = await import("../ai/mediapipe.service.js");
            const res = await MediaPipeService.deployVisionPipeline(args.trackingMode);
            return { output: `### Edge AI Vision Active\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Edge vision failed: ${err.message}` };
          }
        }        case "compile_embedded_firmware": {
          try {
            const { PlatformIOService } = await import("../iot/platformio.service.js");
            const res = await PlatformIOService.compileHardwareBinary(args.boardType);
            return { output: `### PlatformIO Build Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `PlatformIO build failed: ${err.message}` };
          }
        }        case "compile_ml_to_hardware": {
          try {
            const { TVMService } = await import("../ai/tvm.service.js");
            const res = await TVMService.compileHardwareModel(args.modelArch, args.hardwareTarget);
            return { output: `### TVM Hardware Compilation\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `TVM compilation failed: ${err.message}` };
          }
        }        case "compile_freertos_firmware": {
          try {
            const { FreeRTOSService } = await import("../iot/freertos.service.js");
            const res = await FreeRTOSService.deployFirmwareTask(args.taskDescription);
            return { output: `### Embedded Firmware Compiled\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Firmware compilation failed: ${err.message}` };
          }
        }        case "simulate_quantum_circuit": {
          try {
            const { QiskitService } = await import("../compute/qiskit.service.js");
            const res = await QiskitService.simulateQuantumCircuit(args.circuitDescription);
            return { output: `### Quantum Simulation Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Quantum simulation failed: ${err.message}` };
          }
        }        case "compile_tailwind_css": {
          try {
            const { TailwindService } = await import("../ui/tailwind.service.js");
            const res = await TailwindService.compileStyles(args.htmlContent);
            return { output: `### CSS Compiled\\n\\n```css\\n${res.css}\\n```` };
          } catch (err) {
            return { output: `CSS compilation failed: ${err.message}` };
          }
        }        case "run_ui_automation_test": {
          try {
            const { AppiumService } = await import("../qa/appium.service.js");
            const res = await AppiumService.runUiTests(args.appBinaryPath, args.testScript);
            return { output: `### UI Automation Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `UI automation failed: ${err.message}` };
          }
        }        case "inject_native_hardware_bridge": {
          try {
            const { CapacitorService } = await import("../mobile/capacitor.service.js");
            const res = await CapacitorService.injectNativeBridge(args.webAppPath, args.targetHardware);
            return { output: `### Native Bridge Configured\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Bridge injection failed: ${err.message}` };
          }
        }        case "compile_desktop_app": {
          try {
            const { TauriService } = await import("../desktop/tauri.service.js");
            const res = await TauriService.compileDesktopApp(args.webAppPath, args.osTarget);
            return { output: `### Native Desktop Build\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Desktop compilation failed: ${err.message}` };
          }
        }        case "compile_mobile_app": {
          try {
            const { ReactNativeService } = await import("../mobile/reactnative.service.js");
            const res = await ReactNativeService.compileMobileApp(args.projectName, args.targetOs);
            return { output: `### Mobile Build Complete\\n\\n[Download ${res.os} Binary](${res.url})` };
          } catch (err) {
            return { output: `Mobile compilation failed: ${err.message}` };
          }
        }        case "transpile_typescript_esbuild": {
          try {
            const { ESBuildService } = await import("../ide/esbuild.service.js");
            const res = await ESBuildService.transpileTypeScript(args.entryFile);
            return { output: `### ESBuild Compilation Complete\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `ESBuild failed: ${err.message}` };
          }
        }        case "bundle_frontend_vite": {
          try {
            const { ViteService } = await import("../ide/vite.service.js");
            const res = await ViteService.bundleFrontend(args.repoPath);
            return { output: `### Vite Bundle Complete\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Vite bundling failed: ${err.message}` };
          }
        }        case "provision_nix_environment": {
          try {
            const { NixService } = await import("../devops/nix.service.js");
            const res = await NixService.provisionEnvironment(args.flakeConfig);
            return { output: `### Nix Environment Active\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Nix provision failed: ${err.message}` };
          }
        }        case "execute_bazel_build": {
          try {
            const { BazelService } = await import("../ide/bazel.service.js");
            const res = await BazelService.executeBuild(args.targetPath);
            return { output: `### Monorepo Build Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Bazel build failed: ${err.message}` };
          }
        }        case "execute_cicd_pipeline": {
          try {
            const { DroneService } = await import("../devops/drone.service.js");
            const res = await DroneService.executePipeline(args.repoUrl, args.pipelineYaml);
            return { output: `### CI/CD Pipeline Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Pipeline execution failed: ${err.message}` };
          }
        }        case "spin_up_binder_env": {
          try {
            const { BinderHubService } = await import("../compute/binderhub.service.js");
            const res = await BinderHubService.spinUpEnvironment(args.repoUrl);
            return { output: `### Live Binder Environment\\n\\n[Open Executable Repo](${res.url})` };
          } catch (err) {
            return { output: `Binder execution failed: ${err.message}` };
          }
        }        case "execute_distributed_ray_job": {
          try {
            const { RayService } = await import("../compute/ray.service.js");
            const res = await RayService.executeDistributedJob(args.jobName, args.cores);
            return { output: `### Ray Compute Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Ray execution failed: ${err.message}` };
          }
        }        case "track_model_mlflow": {
          try {
            const { MLflowService } = await import("../ai/mlflow.service.js");
            const res = await MLflowService.logModelTraining(args.modelName, args.metrics || {});
            return { output: `### MLflow Tracking Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `MLflow tracking failed: ${err.message}` };
          }
        }        case "deploy_airflow_dag": {
          try {
            const { AirflowService } = await import("../devops/airflow.service.js");
            const res = await AirflowService.deployDAG(args.dagName, args.cronSchedule);
            return { output: `### Airflow DAG Deployed\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `DAG deployment failed: ${err.message}` };
          }
        }        case "generate_plotly_chart": {
          try {
            const { PlotlyService } = await import("../data/plotly.service.js");
            const res = await PlotlyService.generateChart(args.dataset, args.chartType);
            return { output: res.markdown };
          } catch (err) {
            return { output: `Plotly chart failed: ${err.message}` };
          }
        }        case "execute_node_rpc": {
          try {
            const { RpcService } = await import("../web3/rpc.service.js");
            const res = await RpcService.executeNodeCall(args.nodeUrl, args.method, args.params);
            return { output: `### Node RPC Execution\\n\\n```text\\n${res.result}\\n```` };
          } catch (err) {
            return { output: `RPC failed: ${err.message}` };
          }
        }        case "spin_up_blockchain_simulator": {
          try {
            const { GanacheService } = await import("../web3/ganache.service.js");
            const res = await GanacheService.spinUpSimulator();
            return { output: `### Blockchain Simulator Active\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Ganache failed: ${err.message}` };
          }
        }        case "provision_enterprise_blockchain": {
          try {
            const { HyperledgerService } = await import("../web3/hyperledger.service.js");
            const res = await HyperledgerService.provisionNetwork(args.networkName, args.nodes);
            return { output: `### Enterprise Blockchain Deployed\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Hyperledger deployment failed: ${err.message}` };
          }
        }        case "encrypt_data_payload": {
          try {
            const { CryptoService } = await import("../security/crypto.service.js");
            const res = await CryptoService.encryptPayload(args.payloadData);
            return { output: `### Cryptographic Encryption Active\\n\\nKey Hash: ${res.keyHash}\\nEncrypted Blob: ${res.encryptedBlob}` };
          } catch (err) {
            return { output: `Encryption failed: ${err.message}` };
          }
        }        case "pin_to_ipfs": {
          try {
            const { IPFSService } = await import("../web3/ipfs.service.js");
            const res = await IPFSService.pinFile(args.filePath);
            return { output: `### Decentralized IPFS Upload\\n\\nCID Hash: ${res.cid}\\nNetwork URL: ${res.url}` };
          } catch (err) {
            return { output: `IPFS upload failed: ${err.message}` };
          }
        }        case "compress_to_parquet": {
          try {
            const { ParquetService } = await import("../data/parquet.service.js");
            const res = await ParquetService.compressDataset(args.datasetPath);
            return { output: `### Parquet Compression Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Parquet compression failed: ${err.message}` };
          }
        }        case "generate_graphql_schema": {
          try {
            const { GraphQLService } = await import("../api/graphql.service.js");
            const res = await GraphQLService.generateSchema(args.databaseName);
            return { output: `### GraphQL Schema Generated\\n\\n```graphql\\n${res.schema}\\n```` };
          } catch (err) {
            return { output: `Schema generation failed: ${err.message}` };
          }
        }        case "build_text_index": {
          try {
            const { LuceneService } = await import("../data/lucene.service.js");
            const res = await LuceneService.indexText(args.corpusName);
            return { output: `### Lucene Index Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Indexing failed: ${err.message}` };
          }
        }        case "execute_graph_traversal": {
          try {
            const { TinkerPopService } = await import("../data/tinkerpop.service.js");
            const res = await TinkerPopService.executeGremlinQuery(args.query);
            return { output: `### Graph Traversal Result\\n\\n```text\\n${res.result}\\n```` };
          } catch (err) {
            return { output: `Graph traversal failed: ${err.message}` };
          }
        }        case "provision_search_index": {
          try {
            const { MeiliSearchService } = await import("../data/meilisearch.service.js");
            const res = await MeiliSearchService.provisionSearchIndex(args.indexName);
            return { output: `### Search Index Configured\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Search index failed: ${err.message}` };
          }
        }        case "deploy_visual_flow": {
          try {
            const { NodeRedService } = await import("../iot/nodered.service.js");
            const res = await NodeRedService.deployFlow(args.flowDescription);
            return { output: `### Node-RED Flow Deployed\\n\\n[Access Visual Editor](${res.url})` };
          } catch (err) {
            return { output: `Flow deployment failed: ${err.message}` };
          }
        }        case "configure_edge_proxy": {
          try {
            const { EnvoyService } = await import("../security/envoy.service.js");
            const res = await EnvoyService.configureProxy(args.domain, args.routingRules);
            return { output: `### Edge Proxy Configured\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Envoy configuration failed: ${err.message}` };
          }
        }        case "compile_to_webassembly": {
          try {
            const { WasmtimeService } = await import("../ide/wasmtime.service.js");
            const res = await WasmtimeService.compileToWasm(args.sourceCode, args.language);
            return { output: `### WASM Compilation Complete\\n\\n[Download .wasm Module](${res.wasmUrl})\\nStatus: ${res.status}` };
          } catch (err) {
            return { output: `WASM compilation failed: ${err.message}` };
          }
        }        case "deploy_kubernetes_manifest": {
          try {
            const { KubernetesService } = await import("../devops/kubernetes.service.js");
            const res = await KubernetesService.deployToCluster(args.manifestYaml);
            return { output: `### K8s Deployment Execution\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `K8s deployment failed: ${err.message}` };
          }
        }        case "build_os_container": {
          try {
            const { ContainerdService } = await import("../devops/containerd.service.js");
            const res = await ContainerdService.buildContainer(args.dockerfileConfig);
            return { output: `### Container Build Complete\\n\\nImage: ${res.imageTag}\\nStatus: ${res.status}` };
          } catch (err) {
            return { output: `Container build failed: ${err.message}` };
          }
        }        case "provision_data_notebook": {
          try {
            const { ZeppelinService } = await import("../compute/zeppelin.service.js");
            const res = await ZeppelinService.provisionNotebook(args.notebookName, args.languages || ["python", "sql"]);
            return { output: `### Analytics Notebook Active\\n\\n[Access Zeppelin Interface](${res.url})` };
          } catch (err) {
            return { output: `Notebook failed: ${err.message}` };
          }
        }        case "transpile_code_ast": {
          try {
            const { SwcService } = await import("../ide/swc.service.js");
            const res = await SwcService.transpileCode(args.code, args.targetLanguage);
            return { output: `### AST Transpilation Result\\n\\n```${args.targetLanguage}\\n${res.code}\\n```` };
          } catch (err) {
            return { output: `Transpilation failed: ${err.message}` };
          }
        }        case "provision_sso_portal": {
          try {
            const { KeycloakService } = await import("../security/keycloak.service.js");
            const res = await KeycloakService.provisionAuth(args.domain, args.authType);
            return { output: `### Secure IAM Portal Deployed\\n\\nPortal URL: ${res.url}\\nStatus: ${res.status}` };
          } catch (err) {
            return { output: `IAM deployment failed: ${err.message}` };
          }
        }        case "extract_file_metadata": {
          try {
            const { TikaService } = await import("../rag/tika.service.js");
            const res = await TikaService.extractContent(args.filePath);
            return { output: `### Tika Extraction Complete\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Tika extraction failed: ${err.message}` };
          }
        }        case "track_objects_in_video": {
          try {
            const { OpenCVService } = await import("../vision/opencv.service.js");
            const res = await OpenCVService.trackObjects(args.videoStreamUrl, args.targetObject);
            return { output: `### OpenCV Analysis\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `OpenCV analysis failed: ${err.message}` };
          }
        }        case "execute_arrow_computation": {
          try {
            const { ArrowService } = await import("../compute/arrow.service.js");
            const res = await ArrowService.executeColumnarQuery(args.dataset, args.query);
            return { output: `### Arrow Computation Result\\n\\n```text\\n${res.result}\\n```` };
          } catch (err) {
            return { output: `Arrow compute failed: ${err.message}` };
          }
        }        case "process_data_stream_flink": {
          try {
            const { FlinkService } = await import("../data/flink.service.js");
            const res = await FlinkService.orchestrateStream(args.streamSource, args.computationLogic);
            return { output: `### Flink Job Executed\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Flink deployment failed: ${err.message}` };
          }
        }        case "generate_3d_map": {
          try {
            const { MapLibreService } = await import("../ui/maplibre.service.js");
            const res = await MapLibreService.generateMap(args.datasetOverlay);
            return { output: res.markdown };
          } catch (err) {
            return { output: `Map generation failed: ${err.message}` };
          }
        }        case "seed_webtorrent_file": {
          try {
            const { WebTorrentService } = await import("../data/webtorrent.service.js");
            const res = await WebTorrentService.seedFile(args.filePath);
            return { output: `### P2P Seed Active\\n\\n```text\\n${res.magnetUri}\\n```` };
          } catch (err) {
            return { output: `Torrent seed failed: ${err.message}` };
          }
        }        case "create_matrix_room": {
          try {
            const { MatrixService } = await import("../comms/matrix.service.js");
            const res = await MatrixService.createEncryptedRoom(args.roomAlias);
            return { output: `### Secure Comms Established\\n\\nRoom ID: ${res.roomId}\\nStatus: ${res.status}` };
          } catch (err) {
            return { output: `Matrix room failed: ${err.message}` };
          }
        }        case "execute_fleet_patch": {
          try {
            const { SaltStackService } = await import("../devops/saltstack.service.js");
            const res = await SaltStackService.deployPatch(args.targetFleet, args.patchCommand);
            return { output: `### Fleet Execution Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Fleet patch failed: ${err.message}` };
          }
        }        case "generate_3d_webgl_scene": {
          try {
            const { ThreeJsService } = await import("../ui/threejs.service.js");
            const res = await ThreeJsService.generateScene(args.sceneDescription);
            return { output: res.markdown };
          } catch (err) {
            return { output: `3D WebGL generation failed: ${err.message}` };
          }
        }        case "generate_bi_dashboard": {
          try {
            const { SupersetService } = await import("../data/superset.service.js");
            const res = await SupersetService.generateDashboard(args.datasetId);
            return { output: `### Business Intelligence Dashboard\\n\\n[View Live Dashboard](${res.url})` };
          } catch (err) {
            return { output: `Dashboard generation failed: ${err.message}` };
          }
        }        case "create_webrtc_room": {
          try {
            const { LiveKitService } = await import("../media/livekit.service.js");
            const res = await LiveKitService.createRoom(args.roomName);
            return { output: `### Live WebRTC Room Created\\n\\n[Join Room](${res.url})` };
          } catch (err) {
            return { output: `Room creation failed: ${err.message}` };
          }
        }        case "cache_data_valkey": {
          try {
            const { ValkeyService } = await import("../data/valkey.service.js");
            const res = await ValkeyService.cacheData(args.key, args.value);
            return { output: `### Memory Cached\\n\\n${res.status}` };
          } catch (err) {
            return { output: `Valkey cache failed: ${err.message}` };
          }
        }        case "process_image_sharp": {
          try {
            const { SharpService } = await import("../vision/sharp.service.js");
            const res = await SharpService.processImage(args.imageUrl, args.operations);
            return { output: `### Image Processed\\n\\n[View Result](${res.url})` };
          } catch (err) {
            return { output: `Image processing failed: ${err.message}` };
          }
        }        case "publish_kafka_event": {
          try {
            const { KafkaService } = await import("../data/kafka.service.js");
            const res = await KafkaService.publishEvent(args.topic, args.payload);
            return { output: `### Event Streamed\\n\\n${res.status}` };
          } catch (err) {
            return { output: `Kafka publish failed: ${err.message}` };
          }
        }        case "blast_marketing_email": {
          try {
            const { EmailService } = await import("../marketing/email.service.js");
            const res = await EmailService.blastEmail(args.subject, args.markdownContent, args.targetList);
            return { output: `### Marketing Execution\\n\\nSuccessfully dispatched ${res.dispatched} HTML emails to ${args.targetList || "default_list"}.` };
          } catch (err) {
            return { output: `Email blast failed: ${err.message}` };
          }
        }        case "run_dbt_transformation": {
          try {
            const { DbtService } = await import("../data/dbt.service.js");
            const res = await DbtService.runTransformation(args.warehouseUrl, args.sqlLogic);
            return { output: `### Big Data ETL Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `dbt execution failed: ${err.message}` };
          }
        }        case "audit_smart_contract": {
          try {
            const { FoundryService } = await import("../web3/foundry.service.js");
            const res = await FoundryService.compileAndAuditContract(args.solidityCode);
            return { output: `### Web3 Audit Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Web3 audit failed: ${err.message}` };
          }
        }        case "test_api_endpoint": {
          try {
            const { HoppscotchService } = await import("../devops/hoppscotch.service.js");
            const res = await HoppscotchService.testEndpoint(args.endpointUrl, args.method);
            return { output: `### API Validation Report\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `API test failed: ${err.message}` };
          }
        }        case "debug_production_outage": {
          try {
            const { SigNozService } = await import("../devops/signoz.service.js");
            const res = await SigNozService.debugOutage(args.serviceName);
            return { output: `### Live APM Diagnosis\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `APM diagnosis failed: ${err.message}` };
          }
        }        case "execute_in_microvm": {
          try {
            const { FirecrackerService } = await import("../devops/firecracker.service.js");
            const res = await FirecrackerService.executeSafely(args.dangerousCode);
            return { output: `### MicroVM Execution\\n\\n${res.log}` };
          } catch (err) {
            return { output: `Execution failed: ${err.message}` };
          }
        }        case "deploy_cloud_infrastructure": {
          try {
            const { PulumiService } = await import("../devops/pulumi.service.js");
            const res = await PulumiService.deployInfrastructure(args.cloudProvider, args.architectureDesc);
            return { output: `### Cloud Deployment Plan\\n\\n```text\\n${res.log}\\n```` };
          } catch (err) {
            return { output: `Deployment failed: ${err.message}` };
          }
        }        case "generate_browser_trace": {
          try {
            const { BrowserService } = await import("../browser/browser.service.js");
            const res = await BrowserService.generateTrace(args.url);
            return { output: `### Deep Trace Generated\\n\\n[View Trace](${res.traceUrl})` };
          } catch (err) {
            return { output: `Trace failed: ${err.message}` };
          }
        }        case "decompile_binary": {
          try {
            const { ReverseEngService } = await import("../security/reverse.service.js");
            const res = await ReverseEngService.decompileBinary(args.binaryPath);
            return { output: `### Reverse Engineering Complete\\n\\n```c\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Decompilation failed: ${err.message}` };
          }
        }        case "apply_multiplayer_edits": {
          try {
            const { YjsService } = await import("../collaboration/yjs.service.js");
            const res = await YjsService.syncDocumentState(args.docId, args.edits);
            return { output: `### Live Collaboration Sync\\n\\n${res.status}` };
          } catch (err) {
            return { output: `Sync failed: ${err.message}` };
          }
        }        case "generate_interactive_diagram": {
          try {
            const { DiagramService } = await import("../ui/diagram.service.js");
            const res = await DiagramService.generateDiagram(args.description, args.type);
            return { output: `### Interactive Diagram\\n\\n```mermaid\\n${res.markdown}\\n```` };
          } catch (err) {
            return { output: `Diagram generation failed: ${err.message}` };
          }
        }        case "validate_code_lsp": {
          try {
            const { LSPService } = await import("../ide/lsp.service.js");
            const res = await LSPService.validateCode(args.code, args.language);
            if (res.isValid) {
               return { output: `### LSP Validation Passed\\n\\n```${args.language}\\n${args.code}\\n```` };
            } else {
               return { output: `### LSP Validation Failed\\n\\nErrors:\\n${res.errors.join("\\n")}\\n\\nPlease correct the code.` };
            }
          } catch (err) {
            return { output: `LSP validation failed: ${err.message}` };
          }
        }        case "run_database_migration": {
          try {
            const { AtlasService } = await import("../database/atlas.service.js");
            const res = await AtlasService.inspectAndMigrate(args.targetConnectionString, args.desiredSchema);
            return { output: `### Database Migration Plan\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Migration failed: ${err.message}` };
          }
        }        case "generate_3d_model": {
          try {
            const { TripoSRService } = await import("../3d/triposr.service.js");
            const res = await TripoSRService.generate3DModel(args.prompt);
            return { output: `### Generated 3D Asset\\n\\n[Download/View Model (.glb)](${res.url})` };
          } catch (err) {
            return { output: `3D generation failed: ${err.message}` };
          }
        }        case "generate_audio_track": {
          try {
            const { MusicGenService } = await import("../audio/musicgen.service.js");
            const res = await MusicGenService.generateAudio(args.prompt, args.durationSec);
            return { output: `### Generated Audio\\n\\n[Listen to your track](${res.url})` };
          } catch (err) {
            return { output: `Audio generation failed: ${err.message}` };
          }
        }        case "run_security_audit": {
          try {
            const { SemgrepService } = await import("../security/semgrep.service.js");
            const res = await SemgrepService.scanRepository(args.repoPath);
            return { output: `### Security Audit Complete\\n\\n```text\\n${res.report}\\n```` };
          } catch (err) {
            return { output: `Security audit failed: ${err.message}` };
          }
        }        case "query_financial_terminal": {
          try {
            const { OpenBBService } = await import("../finance/openbb.service.js");
            const res = await OpenBBService.queryMarketData(args.ticker, args.dataClass);
            return { output: `### Financial Analysis\\n\\n```text\\n${res.data}\\n```` };
          } catch (err) {
            return { output: `Financial query failed: ${err.message}` };
          }
        }        case "generate_video_clip": {
          try {
            const { VideoGenService } = await import("../video/videogen.service.js");
            const res = await VideoGenService.generateVideo(args.prompt, args.duration);
            return { output: `### Generated Video\\n\\n[Click here to view your video](${res.url})` };
          } catch (err) {
            return { output: `Video generation failed: ${err.message}` };
          }
        }        case "dspy_compile_task": {
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
