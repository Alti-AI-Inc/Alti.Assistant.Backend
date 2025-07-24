# 🌐 ASON AI Core Service


🚀 **Overview**  
ASON AI is a powerful AI-driven platform designed to revolutionize content creation, task automation, and intelligent interactions. From generating high-quality audio and video to engaging in prompt-based AI conversations and deploying specialized AI agents, ASON AI brings a wide array of advanced artificial intelligence technologies into a single, user-friendly platform.

Visit our website for more information: [ASON AI Website](https://www.asonai.com/)

---

🌟 **Key Features**

### 💬 **Prompt-Based AI**

- **Conversational AI:** Engage in dynamic, context-aware conversations with AI that remembers previous interactions.
- **Custom AI Agents:** Design and deploy AI agents tailored for specific roles like customer support, content creation, and data analysis.
- **AI Content Generation:** Generate blog posts, articles, and social media content from simple prompts.
- **Integrated AI Agents:**
  - **Browser-Use Agent:** Automate web browsing tasks, fetch data from websites, and interact with web-based content seamlessly.
  - **Composio Agent:** Manage complex workflows, automate tasks, and integrate with third-party systems through a customizable orchestration process.

### 🎧 **Audio Generation**
- **Text-to-Speech (TTS):** Transform text into natural, human-like speech with cutting-edge AI models.
- **Music Composition:** Create custom music tracks tailored to your preferences and needs.
- **Audio Enhancement:** Utilize AI to enhance the quality of existing audio, removing noise and improving clarity.

### 📈 **Analytics & Insights**
- **Usage Analytics:** Track and analyze how AI models are being utilized and assess their performance.
- **User Behavior Analysis:** Gain insights into user interactions with AI to enhance user experiences.
- **Real-Time Monitoring:** Keep an eye on AI operations in real-time for quick troubleshooting and optimization.

### 🔒 **Security & Compliance**
- **Data Encryption:** Secure all data handled by the platform with encryption both at rest and in transit.
- **Compliance Management:** Ensure AI operations adhere to relevant regulations with built-in compliance tools.

---


## 📦 Tech Stack

### Core Service
- **Node.js / Express** — Backend Framework for the ASON API Gateway
- **MongoDB** — Primary Database for user data and application storage
- **Redis** — Caching and Session Management
- **Socket.IO** — Real-Time Communication
- **RabbitMQ** — Messaging & Task Queuing for event-driven architecture
- **Elasticsearch + Kibana** — Logging & Monitoring
- **Grafana** — Visualization & Metrics
- **Docker + Docker Compose** — Containerized Microservices for efficient deployment and management

### AI-Agent Service
- **Python** — Core language for AI agent development
- **PostgreSQL** — Database for storing AI-specific data and model states
- **Socket.IO** — Real-Time Communication for AI agent interactions
- **Redis** — Caching and session management
- **RabbitMQ** — Messaging & Task Queuing for orchestrating AI agents
- **Elasticsearch + Kibana** — Logging & Monitoring for AI agent operations
- **Grafana** — Visualization & Metrics for AI system performance
- **Docker + Docker Compose** — Containerized Microservices for AI agent deployment and scalability

### API Gateway
- **TypeScript** — Language for developing the API Gateway with strong typing
- **Redis** — Caching and Session Management for API Gateway
- **RabbitMQ** — Messaging & Task Queuing for API Gateway services
- **Elasticsearch + Kibana** — Logging & Monitoring for API Gateway activities
- **Grafana** — Visualization & Metrics for API Gateway performance
- **Docker + Docker Compose** — Containerized Microservices for API Gateway


## � Quick Start & Deployment

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/shohidul-jaman-anik/ASON-Backend-Core-Service.git
   cd ASON-Core-Service-Backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Update .env with your configuration
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

### Production Deployment

#### Google Cloud Run (Recommended)

1. **Quick Setup:**
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

2. **Deploy:**
   ```bash
   ./deploy.sh
   ```

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)

#### Docker Deployment

```bash
# Build and run with Docker
docker build -t ason-backend .
docker run -p 5100:5100 ason-backend
```

#### Docker Compose

```bash
# Start all services
docker-compose up -d
```

## �📚 Developer Documentation

Explore our full documentation for comprehensive setup guides, API references, and integration tutorials across all services.

| Service           | API Documentation                                                               | GitHub Repository                                               |
|-------------------|----------------------------------------------------------------------------------|------------------------------------------------------------------|
| Core Service      | [View on Postman →](https://documenter.getpostman.com/view/22819233/2sB2qak2mM) | [GitHub →](https://github.com/shohidul-jaman-anik/ASON-Backend-Core-Service) |
| AI-Agent Service  | [View on Postman →](https://documenter.getpostman.com/view/22819233/2sB2qak2mN) | [GitHub →](https://github.com/shohidul-jaman-anik/ASON-Backend-Ai-Agent-Service)      |
| API Gateway       | [View on Postman →](https://documenter.getpostman.com/view/22819233/2sB2qak2qe) | [GitHub →](https://github.com/shohidul-jaman-anik/ASON-Api-Gateway)          |



