/**
 * MCP Application Catalog Blueprints
 * 
 * Declares standard, optimized configurations for official and popular open-source MCP servers.
 * Spawns these packages programmatically using standard server-side node/npx executions.
 */
export const mcpCatalog = {
  "github": {
    "id": "github",
    "name": "GitHub Workspace Integration",
    "description": "Exposes full read and write integration into GitHub repositories to edit code, manage issues, and review pull requests.",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-github"
    ],
    "requiredEnv": [
      "GITHUB_PERSONAL_ACCESS_TOKEN"
    ],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": ""
    }
  },
  "postgres": {
    "id": "postgres",
    "name": "Postgres Database Connector",
    "description": "Queries, maps, and executes safe database scripts on PostgreSQL database engines.",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-postgres"
    ],
    "requiredArgs": [
      "databaseUrl"
    ],
    "env": {}
  },
  "sqlite": {
    "id": "sqlite",
    "name": "SQLite Relational Sandbox",
    "description": "Local, high-performance SQLite relational database engine, isolated cleanly inside the user's workspace sandbox.",
    "command": "npx",
    "args": [
      "-y",
      "mcp-sqlite",
      "storage/users/{{tenantId}}/databases/sqlite.db"
    ],
    "requiredEnv": [],
    "env": {}
  },
  "brave-search": {
    "id": "brave-search",
    "name": "Brave Web Grounding",
    "description": "Real-time, zero-latency Brave Search Web grounding to fetch clean snippets and context without external web scrapers.",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-brave-search"
    ],
    "requiredEnv": [
      "BRAVE_API_KEY"
    ],
    "env": {
      "BRAVE_API_KEY": ""
    }
  },
  "playwright": {
    "id": "playwright",
    "name": "Playwright Web Automation",
    "description": "Playwright headless browser automation, form-filling, clicking, and full single-page application (SPA) interaction.",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-playwright"
    ],
    "requiredEnv": [],
    "env": {}
  },
  "fetch": {
    "id": "fetch",
    "name": "Web Fetch Markdown Scraper",
    "description": "Direct read, write, and search capabilities on web domains, fetching clean parsed Markdown content from any URL.",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-fetch"
    ],
    "requiredEnv": [],
    "env": {}
  },
  "evernote": {
    "id": "evernote",
    "name": "Evernote Notes Integration",
    "description": "Access, search, and manage Evernote notes, folders, and notebooks programmatically inside your chat sessions.",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-evernote"
    ],
    "requiredEnv": [
      "EVERNOTE_API_KEY"
    ],
    "env": {
      "EVERNOTE_API_KEY": ""
    }
  }
};
