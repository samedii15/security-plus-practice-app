/**
 * Discord Notification Service
 * Sends real-time alerts for brute-force protection events
 * with intelligent batching to prevent Discord rate limits
 * 
 * Environment Variables:
 *   DISCORD_WEBHOOK_URL - Discord webhook URL for alerts
 *   DISCORD_RATE_LIMIT_HIGH_PER_MINUTE - Max HIGH severity alerts per minute (default: 3)
 *   DISCORD_RATE_LIMIT_MEDIUM_PER_HOUR - Max MEDIUM severity alerts per hour (default: 10)
 */

const DISCORD_CONFIG = {
  webhook_url: process.env.DISCORD_WEBHOOK_URL || '',
  enabled: !!process.env.DISCORD_WEBHOOK_URL,
  rate_limit_high_per_minute: parseInt(process.env.DISCORD_RATE_LIMIT_HIGH_PER_MINUTE || '3'),
  rate_limit_medium_per_hour: parseInt(process.env.DISCORD_RATE_LIMIT_MEDIUM_PER_HOUR || '10'),
  batch_low_severity_interval_ms: parseInt(process.env.DISCORD_BATCH_INTERVAL_MS || '3600000'), // 1 hour
};

// Rate limit trackers
const rateLimitTrackers = {
  high: [],      // timestamps of HIGH alerts sent
  medium: [],    // timestamps of MEDIUM alerts sent
  low: [],       // queued LOW severity events for batching
};

// Stats tracking
const stats = {
  sent_total: 0,
  sent_high: 0,
  sent_medium: 0,
  sent_low_batches: 0,
  rate_limited: 0,
  errors: 0,
};

/**
 * Send a message to Discord webhook
 */
async function sendToDiscord(payload) {
  if (!DISCORD_CONFIG.enabled) {
    console.log('[Discord] Not configured (no webhook URL)');
    return false;
  }

  try {
    const response = await fetch(DISCORD_CONFIG.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      stats.sent_total++;
      return true;
    } else {
      const errorText = await response.text();
      console.error(`[Discord] Webhook failed: ${response.status} - ${errorText}`);
      stats.errors++;
      return false;
    }
  } catch (err) {
    console.error(`[Discord] Send error: ${err.message}`);
    stats.errors++;
    return false;
  }
}

/**
 * Check if we're within rate limits for a severity level
 */
function isWithinRateLimit(severity) {
  const now = Date.now();

  if (severity === 'HIGH') {
    // Remove old entries (older than 1 minute)
    const cutoff = now - 60000;
    rateLimitTrackers.high = rateLimitTrackers.high.filter(ts => ts > cutoff);
    return rateLimitTrackers.high.length < DISCORD_CONFIG.rate_limit_high_per_minute;
  }

  if (severity === 'MEDIUM') {
    // Remove old entries (older than 1 hour)
    const cutoff = now - 3600000;
    rateLimitTrackers.medium = rateLimitTrackers.medium.filter(ts => ts > cutoff);
    return rateLimitTrackers.medium.length < DISCORD_CONFIG.rate_limit_medium_per_hour;
  }

  // LOW severity is always batched, never checked for rate limit
  return true;
}

/**
 * Record that we sent an alert for rate limiting purposes
 */
function recordSent(severity) {
  const now = Date.now();

  if (severity === 'HIGH') {
    rateLimitTrackers.high.push(now);
    stats.sent_high++;
  } else if (severity === 'MEDIUM') {
    rateLimitTrackers.medium.push(now);
    stats.sent_medium++;
  }
}

/**
 * Format a Discord embed for an alert
 */
function createEmbed(event) {
  const colors = {
    HIGH: 15158332,    // Red
    MEDIUM: 16776960,  // Yellow
    LOW: 3447003,      // Blue
  };

  const icons = {
    HIGH: '🚨',
    MEDIUM: '⚠️',
    LOW: 'ℹ️',
  };

  const severity = event.severity || 'MEDIUM';
  const icon = icons[severity] || 'ℹ️';

  // Base embed structure
  const embed = {
    title: `${icon} ${event.event_title || event.event || 'Security Alert'}`,
    color: colors[severity] || colors.MEDIUM,
    timestamp: new Date().toISOString(),
    fields: [],
  };

  // Add event-specific fields
  if (event.ip_hash) {
    embed.fields.push({
      name: 'IP Hash',
      value: `\`${event.ip_hash}\``,
      inline: true,
    });
  }

  if (event.ban_count_24h) {
    embed.fields.push({
      name: 'Bans (24h)',
      value: `${event.ban_count_24h}`,
      inline: true,
    });
  }

  if (event.attempt_count || event.total_attempts_24h) {
    embed.fields.push({
      name: 'Attempts',
      value: `${event.attempt_count || event.total_attempts_24h}`,
      inline: true,
    });
  }

  if (event.current_ban_duration_seconds) {
    const minutes = Math.ceil(event.current_ban_duration_seconds / 60);
    embed.fields.push({
      name: 'Ban Duration',
      value: `${minutes} minutes`,
      inline: true,
    });
  }

  if (event.unique_accounts_targeted) {
    embed.fields.push({
      name: 'Accounts Targeted',
      value: `${event.unique_accounts_targeted}`,
      inline: true,
    });
  }

  if (event.failure_count) {
    embed.fields.push({
      name: 'Failures',
      value: `${event.failure_count}`,
      inline: true,
    });
  }

  // Add action required or notes
  if (event.action_required) {
    embed.fields.push({
      name: '⚡ Action Required',
      value: event.action_required,
      inline: false,
    });
  }

  if (event.note) {
    embed.fields.push({
      name: 'Note',
      value: event.note,
      inline: false,
    });
  }

  // Add description if no fields
  if (embed.fields.length === 0 && event.message) {
    embed.description = event.message;
  }

  return embed;
}

/**
 * Send an immediate alert to Discord
 */
export async function sendAlert(event) {
  if (!DISCORD_CONFIG.enabled) {
    return false;
  }

  const severity = event.severity || 'MEDIUM';

  // LOW severity events are batched
  if (severity === 'LOW') {
    rateLimitTrackers.low.push(event);
    return true; // Queued for batching
  }

  // Check rate limits
  if (!isWithinRateLimit(severity)) {
    console.log(`[Discord] Rate limited (${severity} severity)  - alert queued`);
    stats.rate_limited++;
    
    // Queue in LOW for next batch
    rateLimitTrackers.low.push(event);
    return false;
  }

  // Send immediately
  const embed = createEmbed(event);
  const payload = {
    username: 'Security Monitor',
    embeds: [embed],
  };

  const sent = await sendToDiscord(payload);
  
  if (sent) {
    recordSent(severity);
    console.log(`[Discord] Sent ${severity} alert: ${event.event || 'alert'}`);
  }

  return sent;
}

/**
 * Send a batched summary of LOW severity events
 */
async function sendBatchedAlerts() {
  if (!DISCORD_CONFIG.enabled || rateLimitTrackers.low.length === 0) {
    return;
  }

  console.log(`[Discord] Sending batched summary of ${rateLimitTrackers.low.length} events`);

  // Group events by type
  const grouped = {};
  for (const event of rateLimitTrackers.low) {
    const type = event.event || 'UNKNOWN';
    if (!grouped[type]) {
      grouped[type] = [];
    }
    grouped[type].push(event);
  }

  // Create summary embed
  const embed = {
    title: 'ℹ️ Security Events Summary',
    color: 3447003, // Blue
    timestamp: new Date().toISOString(),
    description: `Summary of ${rateLimitTrackers.low.length} low-severity events in the past hour`,
    fields: [],
  };

  // Add grouped counts
  for (const [type, events] of Object.entries(grouped)) {
    const count = events.length;
    let details = `${count} event${count > 1 ? 's' : ''}`;
    
    // Add specific details based on event type
    if (type === 'IP_BAN_TRIGGERED') {
      const uniqueIps = new Set(events.map(e => e.ip_hash)).size;
      details += ` (${uniqueIps} unique IPs)`;
    } else if (type === 'ACCOUNT_LOCKED') {
      details += ` (account lockouts)`;
    } else if (type === 'AUTH_SUCCESS_AFTER_FAILURES') {
      details += ` (users recovered after failures)`;
    }

    embed.fields.push({
      name: type.replace(/_/g, ' '),
      value: details,
      inline: true,
    });
  }

  const payload = {
    username: 'Security Monitor',
    embeds: [embed],
  };

  const sent = await sendToDiscord(payload);
  
  if (sent) {
    stats.sent_low_batches++;
    console.log(`[Discord] Sent batched summary of ${rateLimitTrackers.low.length} events`);
  }

  // Clear the queue
  rateLimitTrackers.low = [];
}

/**
 * Send a test message to verify Discord webhook is working
 */
export async function sendTestAlert() {
  if (!DISCORD_CONFIG.enabled) {
    return {
      success: false,
      message: 'Discord webhook URL not configured',
    };
  }

  const embed = {
    title: '✅ Discord Integration Test',
    description: 'Brute-force protection Discord notifications are configured correctly!',
    color: 5763719, // Green
    timestamp: new Date().toISOString(),
    fields: [
      {
        name: 'Configuration',
        value: [
          `HIGH alerts: ${DISCORD_CONFIG.rate_limit_high_per_minute}/minute`,
          `MEDIUM alerts: ${DISCORD_CONFIG.rate_limit_medium_per_hour}/hour`,
          `Batch interval: ${DISCORD_CONFIG.batch_low_severity_interval_ms / 60000} minutes`,
        ].join('\n'),
        inline: false,
      },
    ],
  };

  const payload = {
    username: 'Security Monitor',
    embeds: [embed],
  };

  const sent = await sendToDiscord(payload);

  return {
    success: sent,
    message: sent ? 'Test alert sent successfully' : 'Failed to send test alert',
  };
}

/**
 * Get Discord notifier statistics
 */
export function getDiscordStats() {
  return {
    enabled: DISCORD_CONFIG.enabled,
    config: {
      rate_limit_high_per_minute: DISCORD_CONFIG.rate_limit_high_per_minute,
      rate_limit_medium_per_hour: DISCORD_CONFIG.rate_limit_medium_per_hour,
      batch_interval_minutes: DISCORD_CONFIG.batch_low_severity_interval_ms / 60000,
    },
    stats: {
      ...stats,
      queued_low_severity: rateLimitTrackers.low.length,
      high_alerts_in_last_minute: rateLimitTrackers.high.length,
      medium_alerts_in_last_hour: rateLimitTrackers.medium.length,
    },
  };
}

// Start batching interval
if (DISCORD_CONFIG.enabled) {
  setInterval(sendBatchedAlerts, DISCORD_CONFIG.batch_low_severity_interval_ms);
  console.log('[Discord] Notification service initialized');
  console.log(`[Discord] Webhook: ${DISCORD_CONFIG.webhook_url.substring(0, 50)}...`);
  console.log(`[Discord] Batching LOW severity events every ${DISCORD_CONFIG.batch_low_severity_interval_ms / 60000} minutes`);
} else {
  console.log('[Discord] Not enabled (DISCORD_WEBHOOK_URL not set)');
}

// Export configuration for inspection
export const config = DISCORD_CONFIG;
