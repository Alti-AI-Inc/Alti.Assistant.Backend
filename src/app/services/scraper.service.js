import { ZenRows } from 'zenrows';

/**
 * APHURA OMNI-EXTRACTION SERVICE
 * Wrapping 100% of ZenRows' documented capabilities into native Aphura Platform endpoints.
 */
export class AphuraExtractionService {
  constructor() {
    this.client = new ZenRows(process.env.ZENROWS_API_KEY || 'ZR_KEY_PLACEHOLDER');
  }

  /**
   * 1. GOD MODE: The Ultimate Bypass
   * Fully executes JS, routes through unbannable residential IPs, and strips WAFs.
   */
  async extractGodMode(targetUrl, options = {}) {
    console.log(`[Omni-Extractor] God Mode executing on: ${targetUrl}`);
    return this.executeUniversalSweep(targetUrl, {
      js_render: true,
      antibot: true,
      premium_proxy: true,
      ...options
    });
  }

  /**
   * 2. LIGHTNING SCRAPE
   * Pure speed. No JS rendering, just raw HTML stripping. Used for standard blogs.
   */
  async extractLightning(targetUrl, options = {}) {
    return this.executeUniversalSweep(targetUrl, {
      js_render: false,
      antibot: false,
      premium_proxy: false,
      ...options
    });
  }

  /**
   * 3. REGIONAL GEO-SPOOFING
   * Forces extraction from a specific country to bypass geographic locks or view local pricing.
   */
  async extractRegional(targetUrl, countryCode, options = {}) {
    return this.executeUniversalSweep(targetUrl, {
      antibot: true,
      premium_proxy: true,
      proxy_country: countryCode.toLowerCase(),
      ...options
    });
  }

  /**
   * 4. TARGETED CSS DATA RIPPING
   * Only returns the specific CSS elements you care about, vastly reducing token context.
   */
  async extractTargeted(targetUrl, cssSelector, options = {}) {
    return this.executeUniversalSweep(targetUrl, {
      js_render: true,
      antibot: true,
      css_extractor: cssSelector,
      ...options
    });
  }

  /**
   * 5. HIGH-FIDELITY MOBILE EMULATION
   * Renders the site using strict Mobile device headers and viewports.
   */
  async extractMobile(targetUrl, options = {}) {
    return this.executeUniversalSweep(targetUrl, {
      js_render: true,
      antibot: true,
      device: 'mobile',
      ...options
    });
  }

  /**
   * 6. LONG-LIVED SESSIONS
   * Maintains cookies and session states across multiple sequential scrapes.
   */
  async extractSession(targetUrl, sessionId, options = {}) {
    return this.executeUniversalSweep(targetUrl, {
      js_render: true,
      antibot: true,
      session_id: sessionId,
      ...options
    });
  }

  /**
   * 7. MULTI-MEDIA / SPA SNAPSHOTS
   * Waits for specific elements to load before capturing the final state of complex SPAs.
   */
  async extractStatefulSPA(targetUrl, waitForSelector, options = {}) {
    return this.executeUniversalSweep(targetUrl, {
      js_render: true,
      antibot: true,
      premium_proxy: true,
      wait_for: waitForSelector,
      ...options
    });
  }

  // The underlying execution engine
  async executeUniversalSweep(targetUrl, config = {}) {
    try {
      // Default to returning clean HTML/JSON
      const finalConfig = { return_elements: true, ...config };
      
      const response = await this.client.get(targetUrl, finalConfig);

      return {
        success: true,
        data: response.data,
        metadata: {
          engine: "Aphura Omni-Extractor (ZenRows Core)",
          status: response.status,
          bypassed: config.antibot || false,
          js_rendered: config.js_render || false,
          geo: config.proxy_country || 'global'
        }
      };
    } catch (error) {
      console.error(`[Omni-Extractor Error] Breach failed on ${targetUrl}:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

export const scraperService = new AphuraExtractionService();
