# Aphura AGI Backend

Enterprise-grade autonomous AI orchestration backend. Designed exclusively for Liberty Center One bare-metal infrastructure.

## Architecture Highlights
- **Orchestration:** LangChain Mixture-of-Agents (MoA) powered by Together.ai.
- **Data Layers:** Apollo GraphQL Supergraph, OpenSearch Hybrid K-NN, Memgraph Vectors, Postgres Relational.
- **Sandboxes:** Zero-trust KVM Code Interpreter, native WebAssembly (Wasm) V8 Engine.
- **Resilience:** RabbitMQ Dead Letter Queues, Redis Pub/Sub backplane, eBPF Kernel Tracing.

## Deployment Instructions

### 1. Provision Bare-Metal Infrastructure
Run Terraform to provision the physical OpenStack network, security groups, and compute nodes on Liberty Center One.
```bash
cd terraform
terraform init
terraform apply -var="os_username=<USER>" -var="os_password=<PASS>"
```

### 2. Configure Environment
Copy the example environment file and populate the OmniData API keys and Database URLs.
```bash
cp .env.example .env
```

### 3. Spin Up Data Infrastructure
Boot the Kafka, Redis, PostgreSQL, Memgraph, OpenSearch, and RabbitMQ clusters using Docker Compose.
```bash
docker-compose up -d
```

### 4. Database Migrations
Push the strict SQL schema to PostgreSQL to create the User and AuditLog tables.
```bash
npx prisma generate
npx prisma db push
```

### 5. Start the AGI Server
Boot the Node.js backend. This starts the Express API Gateway, the gRPC LangChain Supervisor (Port 50051), and the V8 Heap Profiler.
```bash
npm install
npm run start
```

## Security Notice
This stack utilizes `--expose-gc` for aggressive memory management and eBPF kernel tracing. Ensure the host OS has BPF mounting enabled.
