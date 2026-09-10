// monitor.exa.js
// -----------------------------------------------------------------------
// THIS FILE DID NOT EXIST BEFORE. This is the piece that was missing.
//
// Everything in monitor.service.js only ever talks to YOUR OWN database
// (Mongoose). Nothing in your original code ever made a network call to
// Exa's servers. This file is that missing network call layer.
//
// Install first:  npm install exa-js
// -----------------------------------------------------------------------

import Exa from 'exa-js';

const exa = new Exa(process.env.EXA_API_KEY);

/**
 * Actually creates the monitor on Exa's servers.
 * Returns Exa's response, which includes:
 *   - id              -> Exa's real monitor id, e.g. "mon_9f8s7d..."
 *   - webhookSecret   -> shown ONCE, must be stored immediately
 * You must NOT invent these values yourself — they only ever come from
 * this call's response.
 */
const createExaMonitor = async ({
  name,
  search,
  trigger,
  outputSchema,
  metadata,
  webhook,
}) => {
  const monitor = await exa.monitors.create({
    name,
    search, // { query, numResults, contents }
    trigger, // { type: "interval", period: "1d" } or omit for manual-only
    outputSchema, // optional
    metadata, // optional
    webhook, // { url, events } - events must be valid Exa event names
  });
  return monitor;
};

/**
 * Updates the monitor on Exa's side (partial merge, same as Exa's PATCH).
 */
const updateExaMonitor = async (exaMonitorId, payload) => {
  return exa.monitors.update(exaMonitorId, payload);
};

/**
 * Deletes the monitor on Exa's side.
 */
const deleteExaMonitor = async (exaMonitorId) => {
  return exa.monitors.delete(exaMonitorId);
};

/**
 * Starts a run immediately on Exa's servers. This is what actually
 * causes a search to execute — nothing in your local DB writes can
 * ever do this on their own.
 */
const triggerExaMonitor = async (exaMonitorId) => {
  return exa.monitors.trigger(exaMonitorId);
};

/**
 * Optional helper: fetch a single run directly from Exa (useful for
 * manual polling / debugging, separate from the webhook-driven flow).
 */
const getExaRun = async (exaMonitorId, exaRunId) => {
  return exa.monitors.runs.get(exaMonitorId, exaRunId);
};

export const MonitorExa = {
  createExaMonitor,
  updateExaMonitor,
  deleteExaMonitor,
  triggerExaMonitor,
  getExaRun,
};
