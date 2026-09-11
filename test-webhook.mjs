import crypto from 'crypto';

const WEBHOOK_URL = "https://api.altihq.com/api/v1/webhooks/exa";
const secret = "UOS1CIvDIzFs1V514O5lTfRVIb1yJLE8";
const exaMonitorId = "01m25c0txrmb0699gmrmpejtxs";

const payload = {
  id: "event_test_" + Date.now(),
  object: "event",
  type: "monitor.run.completed",
  data: {
    id: "run_test_" + Date.now(),
    monitorId: exaMonitorId,
    status: "completed",
    output: {
      results: [
        {
          title: "Acme AI raises $25M Series A",
          url: "https://example.com/article",
          publishedDate: "2026-09-10"
        }
      ]
    }
  },
  createdAt: new Date().toISOString()
};

const rawBody = JSON.stringify(payload);
const t = Math.floor(Date.now() / 1000);
const signedPayload = `${t}.${rawBody}`;
const v1 = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

const res = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Exa-Signature': `t=${t},v1=${v1}`
  },
  body: rawBody
});

console.log('Status:', res.status);
console.log('Response:', await res.text());