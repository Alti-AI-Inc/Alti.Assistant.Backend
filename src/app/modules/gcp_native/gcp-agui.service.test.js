import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GcpAguiService } from './gcp-agui.service.js';

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('GcpAguiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateAguiSystemPrompt', () => {
    it('should generate a default system prompt with all catalog schemas', () => {
      const prompt = GcpAguiService.generateAguiSystemPrompt();
      expect(prompt).toContain('=== GOOGLE AGENT GRAPHICAL USER INTERFACE (AGUI) STANDARD ===');
      expect(prompt).toContain('metricCard');
      expect(prompt).toContain('chart');
      expect(prompt).toContain('dashboardGrid');
      expect(prompt).toContain('timelinePanel');
    });

    it('should filter schemas based on allowedComponents', () => {
      const prompt = GcpAguiService.generateAguiSystemPrompt(['metricCard']);
      expect(prompt).toContain('metricCard');
      expect(prompt).not.toContain('timelinePanel');
    });

    it('should handle empty or invalid allowedComponents gracefully', () => {
      const prompt = GcpAguiService.generateAguiSystemPrompt([]);
      expect(prompt).toContain('=== APPROVED GRAPHICAL CATALOG ===');
      expect(prompt).not.toContain('metricCard');
    });
  });

  describe('parseAndValidateAgui', () => {
    it('should return failure if rawText is empty or null', () => {
      const resultNull = GcpAguiService.parseAndValidateAgui(null);
      expect(resultNull.success).toBe(false);
      expect(resultNull.containsUi).toBe(true);
      expect(resultNull.errors[0]).toContain('Raw conversational response stream is empty');

      const resultEmpty = GcpAguiService.parseAndValidateAgui('');
      expect(resultEmpty.success).toBe(false);
      expect(resultEmpty.errors[0]).toContain('Raw conversational response stream is empty');
    });

    it('should return containsUi false if no agui-json tags are present', () => {
      const rawText = 'Hello, this is a normal conversational response without UI.';
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(true);
      expect(result.containsUi).toBe(false);
      expect(result.payload).toBeNull();
    });

    it('should successfully parse and validate a valid AGUI payload', () => {
      const rawText = `
        Some conversational intro.
        <agui-json>
        {
          "canvasUpdate": {
            "root": "root-grid",
            "components": [
              {
                "id": "root-grid",
                "type": "dashboardGrid",
                "cols": 4,
                "children": ["card-1"]
              },
              {
                "id": "card-1",
                "type": "metricCard",
                "title": "CPU",
                "value": "90%"
              }
            ]
          }
        }
        </agui-json>
        Some conversational outro.
      `;
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(true);
      expect(result.containsUi).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.payload.canvasUpdate.root).toBe('root-grid');
    });

    it('should strip markdown code block wrappers inside agui-json tags', () => {
      const rawText = `
        <agui-json>
        \`\`\`json
        {
          "canvasUpdate": {
            "root": "root-grid",
            "components": [
              { "id": "root-grid", "type": "dashboardGrid", "children": [] }
            ]
          }
        }
        \`\`\`
        </agui-json>
      `;
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(true);
      expect(result.payload.canvasUpdate.root).toBe('root-grid');
    });

    it('should fail validation if canvasUpdate wrapper is missing', () => {
      const rawText = `
        <agui-json>
        {
          "root": "root-grid",
          "components": []
        }
        </agui-json>
      `;
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Payload missing "canvasUpdate" wrapper.');
    });

    it('should fail validation if root component pointer is missing', () => {
      const rawText = `
        <agui-json>
        {
          "canvasUpdate": {
            "components": [
              { "id": "root-grid", "type": "dashboardGrid", "children": [] }
            ]
          }
        }
        </agui-json>
      `;
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('canvasUpdate is missing a "root" component pointer.');
    });

    it('should fail validation if components is empty or not an array', () => {
      const rawText = `
        <agui-json>
        {
          "canvasUpdate": {
            "root": "root-grid",
            "components": []
          }
        }
        </agui-json>
      `;
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('components must be a non-empty array.');
    });

    it('should fail validation if a component is missing an id', () => {
      const rawText = `
        <agui-json>
        {
          "canvasUpdate": {
            "root": "root-grid",
            "components": [
              { "type": "dashboardGrid", "children": [] }
            ]
          }
        }
        </agui-json>
      `;
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Component is missing an "id" field.');
    });

    it('should fail validation if duplicate component IDs are detected', () => {
      const rawText = `
        <agui-json>
        {
          "canvasUpdate": {
            "root": "root-grid",
            "components": [
              { "id": "root-grid", "type": "dashboardGrid", "children": [] },
              { "id": "root-grid", "type": "metricCard" }
            ]
          }
        }
        </agui-json>
      `;
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Duplicate component ID detected: "root-grid".');
    });

    it('should fail validation if a child component is referenced but not defined', () => {
      const rawText = `
        <agui-json>
        {
          "canvasUpdate": {
            "root": "root-grid",
            "components": [
              { "id": "root-grid", "type": "dashboardGrid", "children": ["missing-child"] }
            ]
          }
        }
        </agui-json>
      `;
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Child component ID "missing-child" is referenced but not defined.');
    });

    it('should fail validation if a circular reference is detected', () => {
      const rawText = `
        <agui-json>
        {
          "canvasUpdate": {
            "root": "node-a",
            "components": [
              { "id": "node-a", "type": "dashboardGrid", "children": ["node-b"] },
              { "id": "node-b", "type": "dashboardGrid", "children": ["node-a"] }
            ]
          }
        }
        </agui-json>
      `;
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Circular reference dependency detected at component ID: "node-a".');
    });

    it('should fail validation if nesting depth exceeds 50 levels (context boundary check)', () => {
      const components = [];
      for (let i = 0; i <= 51; i++) {
        components.push({
          id: `node-${i}`,
          type: 'dashboardGrid',
          children: i < 51 ? [`node-${i + 1}`] : []
        });
      }

      const payload = {
        canvasUpdate: {
          root: 'node-0',
          components
        }
      };

      const rawText = `<agui-json>${JSON.stringify(payload)}</agui-json>`;
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(false);
      expect(result.errors.some(err => err.includes('Nesting depth exceeded limit of 50'))).toBe(true);
    });

    it('should fail validation if orphaned components are detected', () => {
      const rawText = `
        <agui-json>
        {
          "canvasUpdate": {
            "root": "root-grid",
            "components": [
              { "id": "root-grid", "type": "dashboardGrid", "children": [] },
              { "id": "orphan-card", "type": "metricCard" }
            ]
          }
        }
        </agui-json>
      `;
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Orphaned component detected: "orphan-card" is not reachable from the root component.');
    });

    it('should fail validation if root component is missing from components array', () => {
      const rawText = `
        <agui-json>
        {
          "canvasUpdate": {
            "root": "non-existent-root",
            "components": [
              { "id": "some-card", "type": "metricCard" }
            ]
          }
        }
        </agui-json>
      `;
      const result = GcpAguiService.parseAndValidateAgui(rawText);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Declared root component ID "non-existent-root" is missing from the components array.');
    });
  });

  describe('fixAguiPayload', () => {
    it('should return empty string if input is empty', () => {
      expect(GcpAguiService.fixAguiPayload('')).toBe('');
      expect(GcpAguiService.fixAguiPayload(null)).toBe('');
    });

    it('should repair unescaped newlines inside string literals', () => {
      const malformed = '{\n"title": "Line 1\nLine 2"\n}';
      const fixed = GcpAguiService.fixAguiPayload(malformed);
      expect(fixed).toContain('Line 1\\nLine 2');
    });

    it('should repair single quotes to double quotes', () => {
      const malformed = "{ 'title': 'My Title', 'type': 'metricCard' }";
      const fixed = GcpAguiService.fixAguiPayload(malformed);
      expect(fixed).toBe('{ "title": "My Title", "type": "metricCard" }');
    });

    it('should repair unquoted property keys', () => {
      const malformed = '{ title: "My Title", type: "metricCard" }';
      const fixed = GcpAguiService.fixAguiPayload(malformed);
      expect(fixed).toBe('{ "title": "My Title", "type": "metricCard" }');
    });

    it('should remove trailing commas', () => {
      const malformed = '{ "items": [1, 2, 3,], "title": "My Title", }';
      const fixed = GcpAguiService.fixAguiPayload(malformed);
      expect(fixed).toBe('{ "items": [1, 2, 3], "title": "My Title" }');
    });

    it('should close unclosed brackets and braces', () => {
      const malformed = '{ "canvasUpdate": { "root": "grid", "components": [ { "id": "grid"';
      const fixed = GcpAguiService.fixAguiPayload(malformed);
      expect(fixed).toBe('{ "canvasUpdate": { "root": "grid", "components": [ { "id": "grid"}]}}');
    });
  });

  describe('AguiStreamParser', () => {
    it('should return empty array if chunk is empty', () => {
      const parser = new GcpAguiService.AguiStreamParser();
      expect(parser.processChunk('')).toEqual([]);
    });

    it('should process plain text chunks outside of AGUI tags', () => {
      const parser = new GcpAguiService.AguiStreamParser();
      const parts = parser.processChunk('Hello World. ');
      expect(parts).toEqual([{ type: 'text', content: 'Hello World. ' }]);
    });

    it('should detect opening AGUI tag and buffer partial content', () => {
      const parser = new GcpAguiService.AguiStreamParser();
      const parts1 = parser.processChunk('Intro text. <agui-json>');
      expect(parts1).toEqual([
        { type: 'text', content: 'Intro text. ' }
      ]);
      expect(parser.insideTag).toBe(true);

      const parts2 = parser.processChunk('{ "root": "grid"');
      expect(parts2).toEqual([
        { type: 'agui_partial', bufferedLength: 16 }
      ]);
    });

    it('should complete parsing when closing AGUI tag is received', () => {
      const parser = new GcpAguiService.AguiStreamParser();
      parser.processChunk('Intro. <agui-json>');
      parser.processChunk('{ "root": "grid"');
      const parts = parser.processChunk(' } </agui-json> Outro text.');

      expect(parts).toEqual([
        {
          type: 'agui_complete',
          success: true,
          payload: { root: 'grid' }
        },
        {
          type: 'text',
          content: ' Outro text.'
        }
      ]);
      expect(parser.insideTag).toBe(false);
    });

    it('should handle parsing failure gracefully for invalid complete AGUI payloads', () => {
      const parser = new GcpAguiService.AguiStreamParser();
      parser.processChunk('<agui-json>');
      const parts = parser.processChunk(' { invalid json } </agui-json>');

      expect(parts[0].type).toBe('agui_complete');
      expect(parts[0].success).toBe(false);
      expect(parts[0].error).toBeDefined();
      expect(parts[0].rawPayload).toBe('{ invalid json }');
    });
  });

  describe('parseAguiStreamChunk', () => {
    it('should parse stream chunk statelessly and return updated state', () => {
      const initialState = { buffer: '', insideTag: true };
      const chunk = '{ "id": "1" } </agui-json> Outro.';

      const result = GcpAguiService.parseAguiStreamChunk(chunk, initialState);

      expect(result.parts).toEqual([
        {
          type: 'agui_complete',
          success: true,
          payload: { id: '1' }
        },
        {
          type: 'text',
          content: ' Outro.'
        }
      ]);
      expect(result.newState.insideTag).toBe(false);
      expect(result.newState.buffer).toBe('');
    });
  });
});