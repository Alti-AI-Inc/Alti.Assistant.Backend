import { describe, it, expect } from 'vitest';
import {
  dataProcessorAgent,
  dataEtlSynthesizer,
  dbOptimizer,
  postgresDba,
  pdfIngestionAnalyst,
  realEstateAdvisor,
  schemaMapperAgent,
  payloadTransformerAgent
} from './data.agents';

describe('Data Agents Configuration', () => {
  const agents = [
    dataProcessorAgent,
    dataEtlSynthesizer,
    dbOptimizer,
    postgresDba,
    pdfIngestionAnalyst,
    realEstateAdvisor,
    schemaMapperAgent,
    payloadTransformerAgent
  ];

  it('should export all defined agents', () => {
    expect(dataProcessorAgent).toBeDefined();
    expect(dataEtlSynthesizer).toBeDefined();
    expect(dbOptimizer).toBeDefined();
    expect(postgresDba).toBeDefined();
    expect(pdfIngestionAnalyst).toBeDefined();
    expect(realEstateAdvisor).toBeDefined();
    expect(schemaMapperAgent).toBeDefined();
    expect(payloadTransformerAgent).toBeDefined();
  });

  it('should have unique IDs for all agents', () => {
    const ids = agents.map(agent => agent.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(agents.length);
  });

  it('should conform to the agent schema structure', () => {
    agents.forEach(agent => {
      expect(agent).toHaveProperty('id');
      expect(typeof agent.id).toBe('string');
      expect(agent.id.length).toBeGreaterThan(0);

      expect(agent).toHaveProperty('name');
      expect(typeof agent.name).toBe('string');
      expect(agent.name.length).toBeGreaterThan(0);

      expect(agent).toHaveProperty('description');
      expect(typeof agent.description).toBe('string');
      expect(agent.description.length).toBeGreaterThan(0);

      expect(agent).toHaveProperty('systemInstruction');
      expect(typeof agent.systemInstruction).toBe('string');
      expect(agent.systemInstruction.length).toBeGreaterThan(0);

      expect(agent).toHaveProperty('model');
      expect(typeof agent.model).toBe('string');
      expect(agent.model.length).toBeGreaterThan(0);

      expect(agent).toHaveProperty('tools');
      expect(Array.isArray(agent.tools)).toBe(true);

      expect(agent).toHaveProperty('keywords');
      expect(Array.isArray(agent.keywords)).toBe(true);
      expect(agent.keywords.length).toBeGreaterThan(0);
      agent.keywords.forEach(keyword => {
        expect(typeof keyword).toBe('string');
      });
    });
  });

  it('should have correct specific configurations for OmniData Synthesizer', () => {
    expect(dataProcessorAgent.id).toBe('data_processor_agent');
    expect(dataProcessorAgent.model).toBe('gemini-2.5-flash');
    expect(dataProcessorAgent.keywords).toContain('process data');
    expect(dataProcessorAgent.systemInstruction).toContain('CRITICAL LAWS:');
  });

  it('should have correct specific configurations for Data ETL Synthesizer', () => {
    expect(dataEtlSynthesizer.id).toBe('data_etl_synthesizer');
    expect(dataEtlSynthesizer.keywords).toContain('etl');
  });

  it('should have correct specific configurations for Database Performance Specialist', () => {
    expect(dbOptimizer.id).toBe('db_optimizer');
    expect(dbOptimizer.keywords).toContain('query optimization');
  });

  it('should have correct specific configurations for PostgreSQL Database Administrator', () => {
    expect(postgresDba.id).toBe('postgres_dba');
    expect(postgresDba.keywords).toContain('postgres dba');
  });

  it('should have correct specific configurations for Document Layout Analyst', () => {
    expect(pdfIngestionAnalyst.id).toBe('pdf_ingestion_analyst');
    expect(pdfIngestionAnalyst.keywords).toContain('read pdf');
  });

  it('should have correct specific configurations for Real Estate & Lease Analyst', () => {
    expect(realEstateAdvisor.id).toBe('real_estate_advisor');
    expect(realEstateAdvisor.keywords).toContain('real estate');
  });

  it('should have correct specific configurations for Schema Architect & SQL Prover', () => {
    expect(schemaMapperAgent.id).toBe('schema_mapper_agent');
    expect(schemaMapperAgent.keywords).toContain('schema design');
  });

  it('should have correct specific configurations for ETL Stream Sanitizer', () => {
    expect(payloadTransformerAgent.id).toBe('payload_transformer_agent');
    expect(payloadTransformerAgent.keywords).toContain('clean data');
  });
});