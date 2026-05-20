# Alti.Assistant.Backend

This repository has been integrated into the **[Alti.Assistant](https://github.com/mnmballa2323/Alti.Assistant)** monorepo as part of a transition to a single-repository architecture.

All code, history, and active development have been moved to the parent repository. This repository is now empty and preserved for archival purposes.

## Production VM API Configuration Reference

When deploying the backend service on the GCP VM:
- The Express app listens on port `5100` inside its Docker container.
- Nginx routes external queries beginning with `/api/v1` directly to this port.
- Allowed CORS origins include `https://altihq.com` and `https://www.altihq.com`.

