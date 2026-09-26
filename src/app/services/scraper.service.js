import { ZenRows } from 'zenrows';

// Central Platform Extraction Service
export class AphuraExtractionService {
  constructor() {
    // Requires ZENROWS_API_KEY in .env
    this.client = new ZenRows(process.env.ZENROWS_API_KEY || 'ZR_KEY_PLACEHOLDER');
  }

  /**
   * Omni-Extractor Endpoint
   * Automatically bypasses Cloudflare, Datadome, executes JS, and rotates IPs.
   */
  async extractGodMode(targetUrl, options = {}) {
    console.log(`[Aphura Extraction] Breaching perimeter for: ${targetUrl}`);
    
    try {
      const response = await this.client.get(targetUrl, {
        js_render: true,           // Execute React/Vue apps
        antibot: true,             // Bypass WAFs (Cloudflare/PerimeterX)
        premium_proxy: true,       // Route through unbannable residential IPs
        proxy_country: options.country || 'us', 
        wait_for: options.waitForSelector || 'body', 
        css_extractor: options.cssSelector || '', 
      });

      return {
        success: true,
        data: response.data,
        metadata: {
          engine: "ZenRows Neural Override",
          status: response.status
        }
      };
    } catch (error) {
      console.error(`[Aphura Extraction] Breach failed on ${targetUrl}:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

export const scraperService = new AphuraExtractionService();
