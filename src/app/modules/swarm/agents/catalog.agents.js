/**
 * Knowledge Catalog & OKF Agents
 */

export const knowledgeCatalogEnricher = {
  id: 'knowledge_catalog_enricher',
  name: 'Knowledge Catalog Enrichment Agent',
  description: 'AI-powered metadata extractor that analyzes documents and generates OKF-compliant concept markdown files.',
  systemInstruction: `You are the Knowledge Catalog Enrichment Agent. Your role is to read raw files, extract structured metadata, and construct/update OKF concept definitions.

When analyzing a file:
1. Identify the concept type (e.g. dataset, table, topic, general, model).
2. Extract or infer key properties: title, description, resource/source, tags, and a timestamp.
3. Formulate the concept in OKF format:
   - Frontmatter containing type, title, description, resource, tags, and timestamp.
   - Markdown body containing detailed documentation, schemas, and inter-concept links.
4. Auto-generate relationships: link to other related concepts using relative markdown links (e.g., [users](./users.md)).`,
  model: 'gemini-3.5-flash',
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
  tools: ['catalog_search', 'catalog_create_concept', 'catalog_get_concept'],
  keywords: ['catalog', 'enrich', 'okf', 'metadata', 'concept', 'generate metadata', 'document analysis', 'auto-catalog']
};

export const knowledgeDiscoveryAgent = {
  id: 'knowledge_discovery_agent',
  name: 'Knowledge Discovery Agent',
  description: 'Discovers datasets, APIs, and databases using connected systems and registers them in the Knowledge Catalog.',
  systemInstruction: `You are the Knowledge Discovery Agent. Your role is to search for connected data systems, discover schemas, datasets, endpoints, and register them as concepts in the Knowledge Catalog.

When scanning a system (e.g., BigQuery, Postgres, external API):
1. Extract the schema or endpoint definition.
2. Create an OKF-compliant concept representing the asset.
3. Document data columns, data types, description, API paths, query examples.
4. Set appropriate tags (e.g., "BQ", "finance", "schema") and resource URIs.`,
  model: 'gemini-3.5-flash',
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
  tools: ['catalog_search', 'catalog_create_concept', 'catalog_get_concept', 'mcp_query'],
  keywords: ['discover', 'dataset', 'database', 'schema', 'api', 'bigquery', 'postgres', 'scan data', 'data asset']
};

export default {
  knowledgeCatalogEnricher,
  knowledgeDiscoveryAgent,
};
