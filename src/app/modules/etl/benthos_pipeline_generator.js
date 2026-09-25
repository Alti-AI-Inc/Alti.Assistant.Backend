import { logger } from '../../../shared/logger.js';

/**
 * Aphura Benthos Pipeline Generator
 * License: MIT (Benthos Engine)
 * Dynamically compiles connector-specific Benthos YAML pipelines at runtime.
 */
export const BenthosPipelineGenerator = {

  generatePipeline(connectorName, composioAuthToken, destinationLake) {
    return {
      input: {
        type: 'http_client',
        http_client: {
          url: `https://api.composio.dev/v1/connectors/${connectorName}/data`,
          verb: 'GET',
          headers: {
            'Authorization': `Bearer ${composioAuthToken}`,
            'X-Aphura-Sovereign': 'true',
            'X-Data-Direction': 'INBOUND-ONLY'
          },
          rate_limit: '100/s'
        }
      },
      pipeline: {
        processors: [
          {
            type: 'bloblang',
            bloblang: [
              'root = this',
              'root.pii_email = deleted()',
              'root.pii_ssn = deleted()',
              'root.pii_phone = deleted()',
              'root.extracted_at = now()',
              `root.source_connector = "${connectorName}"`,
              'root.sovereignty = "Liberty Center One"'
            ].join('\n')
          },
          {
            type: 'dedupe',
            dedupe: { cache: 'memory', key: '${! json("id") }' }
          }
        ]
      },
      output: {
        type: 'broker',
        broker: {
          outputs: [
            {
              type: 'file',
              file: { path: `/data/lake/${destinationLake}/${connectorName}/${Date.now()}.parquet` }
            }
          ]
        }
      }
    };
  }
};
