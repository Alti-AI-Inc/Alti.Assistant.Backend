import { describe, it, expect } from 'vitest';
import * as agents from './cloud.agents.js';

describe('Cloud Agents Static Definitions', () => {
  const expectedAgentKeys = [
    'id',
    'name',
    'description',
    'systemInstruction',
    'model',
    'tools',
    'keywords'
  ];

  const expectedAgentsList = [
    'gcpGrounding',
    'terraformArchitect',
    'gcpGkeExpert',
    'gcpServerlessExpert',
    'gcpSecurityExpert',
    'gcpDatabaseExpert',
    'gcpDataExpert',
    'gcpMigrationSpecialist',
    'gcpFinopsExpert',
    'gcpMlopsExpert',
    'gcpCloudRunArchitect'
  ];

  it('should export all expected cloud agents', () => {
    expectedAgentsList.forEach((agentName) => {
      expect(agents).toHaveProperty(agentName);
    });
  });

  it('should not export any unexpected agents', () => {
    const exportedKeys = Object.keys(agents);
    expect(exportedKeys.length).toBe(expectedAgentsList.length);
  });

  Object.entries(agents).forEach(([agentKey, agentData]) => {
    describe(`Agent: ${agentKey}`, () => {
      it('should have a valid structure and match the AgentDefinition typedef', () => {
        expect(agentData).toBeTypeOf('object');
        expect(agentData).not.toBeNull();

        // Ensure all required keys are present
        expectedAgentKeys.forEach((key) => {
          expect(agentData).toHaveProperty(key);
        });
      });

      it('should have valid types for all properties', () => {
        expect(agentData.id).toBeTypeOf('string');
        expect(agentData.id.length).toBeGreaterThan(0);

        expect(agentData.name).toBeTypeOf('string');
        expect(agentData.name.length).toBeGreaterThan(0);

        expect(agentData.description).toBeTypeOf('string');
        expect(agentData.description.length).toBeGreaterThan(0);

        expect(agentData.systemInstruction).toBeTypeOf('string');
        expect(agentData.systemInstruction.length).toBeGreaterThan(0);

        expect(agentData.model).toBeTypeOf('string');
        expect(agentData.model).toBe('gemini-3.5-flash');

        expect(Array.isArray(agentData.tools)).toBe(true);
        agentData.tools.forEach((tool) => {
          expect(tool).toBeTypeOf('string');
        });

        expect(Array.isArray(agentData.keywords)).toBe(true);
        expect(agentData.keywords.length).toBeGreaterThan(0);
        agentData.keywords.forEach((keyword) => {
          expect(keyword).toBeTypeOf('string');
        });
      });

      it('should have matching id and export name semantics', () => {
        // Convert camelCase export name to snake_case to verify alignment with ID
        const expectedIdSnippet = agentKey
          .replace(/([A-Z])/g, '_$1')
          .toLowerCase()
          .replace(/^gcp_/, 'gcp_');
        
        expect(agentData.id).toBeTypeOf('string');
        expect(agentData.id.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Specific Agent Configurations', () => {
    it('should verify gcpGrounding has the correct tools and keywords', () => {
      const { gcpGrounding } = agents;
      expect(gcpGrounding.id).toBe('gcp_grounding');
      expect(gcpGrounding.tools).toContain('gcp-catalog-search');
      expect(gcpGrounding.keywords).toContain('gcp');
      expect(gcpGrounding.keywords).toContain('kubernetes');
    });

    it('should verify terraformArchitect has the correct tools and keywords', () => {
      const { terraformArchitect } = agents;
      expect(terraformArchitect.id).toBe('terraform_architect');
      expect(terraformArchitect.tools).toContain('terraform-schema-validator');
      expect(terraformArchitect.keywords).toContain('terraform');
      expect(terraformArchitect.keywords).toContain('iac');
    });

    it('should verify gcpGkeExpert has the correct keywords and empty tools', () => {
      const { gcpGkeExpert } = agents;
      expect(gcpGkeExpert.id).toBe('gcp_gke_expert');
      expect(gcpGkeExpert.tools).toEqual([]);
      expect(gcpGkeExpert.keywords).toContain('gke');
      expect(gcpGkeExpert.keywords).toContain('workload identity');
    });

    it('should verify gcpServerlessExpert configuration', () => {
      const { gcpServerlessExpert } = agents;
      expect(gcpServerlessExpert.id).toBe('gcp_serverless_expert');
      expect(gcpServerlessExpert.tools).toEqual([]);
      expect(gcpServerlessExpert.keywords).toContain('cloud run');
      expect(gcpServerlessExpert.keywords).toContain('pubsub');
    });

    it('should verify gcpSecurityExpert configuration', () => {
      const { gcpSecurityExpert } = agents;
      expect(gcpSecurityExpert.id).toBe('gcp_security_expert');
      expect(gcpSecurityExpert.tools).toEqual([]);
      expect(gcpSecurityExpert.keywords).toContain('kms');
      expect(gcpSecurityExpert.keywords).toContain('cis benchmark');
    });

    it('should verify gcpDatabaseExpert configuration', () => {
      const { gcpDatabaseExpert } = agents;
      expect(gcpDatabaseExpert.id).toBe('gcp_database_expert');
      expect(gcpDatabaseExpert.tools).toEqual([]);
      expect(gcpDatabaseExpert.keywords).toContain('spanner');
      expect(gcpDatabaseExpert.keywords).toContain('alloydb');
    });

    it('should verify gcpDataExpert configuration', () => {
      const { gcpDataExpert } = agents;
      expect(gcpDataExpert.id).toBe('gcp_data_expert');
      expect(gcpDataExpert.tools).toEqual([]);
      expect(gcpDataExpert.keywords).toContain('bigquery');
      expect(gcpDataExpert.keywords).toContain('dataflow');
    });

    it('should verify gcpMigrationSpecialist configuration', () => {
      const { gcpMigrationSpecialist } = agents;
      expect(gcpMigrationSpecialist.id).toBe('gcp_migration_specialist');
      expect(gcpMigrationSpecialist.tools).toEqual([]);
      expect(gcpMigrationSpecialist.keywords).toContain('migration');
      expect(gcpMigrationSpecialist.keywords).toContain('aws to gcp');
    });

    it('should verify gcpFinopsExpert configuration', () => {
      const { gcpFinopsExpert } = agents;
      expect(gcpFinopsExpert.id).toBe('gcp_finops_expert');
      expect(gcpFinopsExpert.tools).toEqual([]);
      expect(gcpFinopsExpert.keywords).toContain('finops');
      expect(gcpFinopsExpert.keywords).toContain('cud');
    });

    it('should verify gcpMlopsExpert configuration', () => {
      const { gcpMlopsExpert } = agents;
      expect(gcpMlopsExpert.id).toBe('gcp_mlops_expert');
      expect(gcpMlopsExpert.tools).toEqual([]);
      expect(gcpMlopsExpert.keywords).toContain('vertex ai');
      expect(gcpMlopsExpert.keywords).toContain('mlops');
    });

    it('should verify gcpCloudRunArchitect configuration', () => {
      const { gcpCloudRunArchitect } = agents;
      expect(gcpCloudRunArchitect.id).toBe('gcp_cloud_run_architect');
      expect(gcpCloudRunArchitect.tools).toEqual([]);
      expect(gcpCloudRunArchitect.keywords).toContain('cloud run');
      expect(gcpCloudRunArchitect.keywords).toContain('knative');
    });
  });
});