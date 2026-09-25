import { logger } from '../../../shared/logger.js';

/**
 * Aphura Sovereign System Manifest
 * The single source of truth that binds all engines into one organism.
 */
export const SOVEREIGN_DOMAINS = {
  IDE:          { engines: ['lsp', 'swc', 'wasmtime', 'bazel', 'vite', 'esbuild', 'treesitter', 'llvm', 'clang', 'ninja', 'emscripten'], purpose: 'Code compilation, AST parsing, language servers' },
  DATA:         { engines: ['dbt', 'kafka', 'valkey', 'superset', 'meilisearch', 'tinkerpop', 'lucene', 'parquet', 'flink', 'presto', 'ignite', 'tikv', 'cassandra', 'hadoop', 'spark', 'beam', 'nifi', 'iceberg', 'faiss', 'druid', 'pinot'], purpose: 'Planetary data lakes, streaming, analytics, search' },
  AI:           { engines: ['mlflow', 'vllm', 'langchain', 'transformers', 'tvm', 'mediapipe', 'ray', 'binderhub', 'mahout', 'mxnet', 'onnx'], purpose: 'ML orchestration, inference optimization, edge vision' },
  SECURITY:     { engines: ['envoy', 'keycloak', 'crypto', 'calico', 'istio', 'linkerd'], purpose: 'Zero-trust networking, SSO, encryption, service mesh' },
  WEB3:         { engines: ['foundry', 'ganache', 'rpc', 'ethers', 'viem', 'walletconnect', 'hardhat', 'openzeppelin', 'hyperledger'], purpose: 'Smart contracts, blockchain, decentralized systems' },
  IOT:          { engines: ['nodered', 'freertos', 'platformio'], purpose: 'Embedded firmware, microcontroller orchestration' },
  QA:           { engines: ['appium', 'puppeteer', 'selenium', 'cypress', 'playwright', 'robotframework'], purpose: 'Cross-platform UI testing, browser automation' },
  ETL:          { engines: ['benthos', 'composio'], purpose: 'Sovereign one-way data extraction from 1,500+ apps' },
  DEVOPS:       { engines: ['pulumi', 'firecracker', 'signoz', 'hoppscotch', 'containerd', 'kubernetes', 'saltstack', 'airflow', 'drone', 'nix', 'crossplane', 'prometheus', 'coredns', 'zookeeper', 'rook', 'longhorn', 'openebs'], purpose: 'Infrastructure, containers, CI/CD, monitoring' },
  COMPUTE:      { engines: ['arrow', 'zeppelin', 'qiskit'], purpose: 'Columnar math, quantum circuits, notebooks' },
  VISION:       { engines: ['sharp', 'opencv'], purpose: 'Image processing, computer vision' },
  UI:           { engines: ['diagram', 'threejs', 'maplibre', 'tailwind', 'babylon', 'pixi'], purpose: '3D rendering, maps, CSS, WebGPU' },
  GAMING:       { engines: ['godot'], purpose: 'Game compilation, interactive environments' },
  SIMULATION:   { engines: ['mujoco', 'jolt'], purpose: 'Physics simulation, collision detection' },
  MOBILE:       { engines: ['reactnative', 'capacitor'], purpose: 'Native iOS/Android compilation, hardware bridging' },
  COMMS:        { engines: ['matrix', 'livekit', 'webtorrent'], purpose: 'E2E messaging, WebRTC, P2P data transfer' },
  API:          { engines: ['graphql', 'grpc', 'kong', 'traefik', 'apisix'], purpose: 'API gateways, RPC, schema management' },
  COLLABORATION:{ engines: ['yjs'], purpose: 'Real-time multiplayer CRDT collaboration' },
  RAG:          { engines: ['tika', 'llamaindex'], purpose: 'Document extraction, semantic indexing' },
  MARKETING:    { engines: ['email'], purpose: 'Transactional and campaign email delivery' }
};

export function getDomainCount() {
  return Object.keys(SOVEREIGN_DOMAINS).length;
}

export function getTotalNamedEngines() {
  let count = 0;
  for (const d of Object.values(SOVEREIGN_DOMAINS)) count += d.engines.length;
  return count;
}
