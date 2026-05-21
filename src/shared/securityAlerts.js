import config from '../../config/index.js';

/**
 * Dispatches a formatted security alert to Discord or Slack if a webhook is configured.
 * Operates asynchronously and is entirely non-blocking to prevent endpoint latency.
 *
 * @param {string} title - The title/subject of the security alert.
 * @param {string} description - The detailed warning text.
 * @param {Object} metadata - Contextual key-value pairs (e.g. IPs, signatures, errors).
 */
export const sendSecurityAlert = async (title, description, metadata = {}) => {
  const webhookUrl = config.stripe.security_alert_webhook;
  if (!webhookUrl) {
    console.log(`[Stripe Security] Webhook alert not configured. Alert: "${title}" - ${description}`);
    return;
  }

  try {
    const isDiscord = webhookUrl.includes('discord.com');
    let payload = {};

    // Sanitize metadata to avoid too long strings or nested object issues
    const sanitizedFields = Object.entries(metadata).map(([key, val]) => {
      let stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (stringVal.length > 1024) {
        stringVal = stringVal.substring(0, 1021) + '...';
      }
      return {
        name: key,
        value: stringVal || 'N/A',
        inline: true
      };
    });

    if (isDiscord) {
      payload = {
        embeds: [
          {
            title: `🛡️ Alti Shield Alert: ${title}`,
            description: description,
            color: 15158332, // Premium warning Red
            fields: sanitizedFields,
            timestamp: new Date().toISOString()
          }
        ]
      };
    } else {
      // Default to Slack-compatible layout
      payload = {
        text: `🛡️ *Alti Shield Alert: ${title}*\n${description}\n\n*Metadata:*\n\`\`\`${JSON.stringify(metadata, null, 2)}\`\`\``
      };
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[Stripe Security Alerts] Webhook alert failed with status: ${response.status}`);
    } else {
      console.log(`[Stripe Security Alerts] Webhook alert sent successfully for: "${title}"`);
    }
  } catch (err) {
    console.error('[Stripe Security Alerts] Failed to dispatch security alert:', err.message);
  }
};
