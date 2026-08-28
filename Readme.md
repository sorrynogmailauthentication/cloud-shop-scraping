# Cenalitika · Retail Price Analytics Platform

Full-stack web application for monitoring and analyzing grocery retail prices across major Russian supermarket chains. Users search products, build custom watchlists, compare prices over time, and export reports for business use.

Built as a production SaaS-style product with OAuth auth, subscription gating, and Docker-based deployment.

<p align="center">
  <img src="frontend/public/landing-hero.webp" alt="Cenalitika landing page" width="720" />
</p>

---

## Overview

The platform ingests daily price snapshots for **70,000+ SKUs** from **8 retail chains** and exposes them through an interactive dashboard. The core workflow: authenticate → search/filter products → curate lists → analyze in table or chart view → export to Excel or PowerPoint.

Designed for analysts and category managers who need repeatable price intelligence without manual spreadsheet work.

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 18, TypeScript, Vite, React Router, Recharts |
| **Backend** | Node.js, Express, TypeScript, JWT |
| **Database** | PostgreSQL 16 |
| **Auth** | Yandex OAuth 2.0, session/JWT middleware |
| **Deployment** | Docker Compose, multi-stage builds, Nginx (static + reverse proxy), TLS |

**Notable client-side work:** dynamic date-range slicing, batched price-history fetching, sortable data tables, chart rendering, and document generation (`pptxgenjs`, `jspdf`, `html2canvas`).

---

## Features

- **Price table** — multi-column comparison with period-over-period deltas, discounts, and sorting
- **Price charts** — time-series visualization with configurable date windows
- **Product search** — filter by shop, category, and name; add results to user-owned lists
- **User lists** — separate watchlists for table and graph views, persisted per account
- **Export** — Excel (CSV) and PowerPoint generation from live dashboard state
- **Access control** — paid subscription checks on API routes; admin panel for user management
- **Landing & auth flow** — marketing page, Yandex ID login, protected app routes

---

## Architecture (high level)

```
Browser → Nginx → React SPA (static)
                → Express API → PostgreSQL
                     ↑
              Yandex OAuth / JWT
```

- **Monorepo layout:** `frontend/`, `backend/`, `nginx/`, `db/init/`
- **API** serves product search, price history, and user list CRUD behind auth middleware
- **Frontend** talks to the API via Vite dev proxy locally; production serves a built bundle from Nginx
- **Postgres** stores users, products, daily price rows, and list membership with schema migrations on startup

---

## Data Model

- **Products** — canonical identity by shop + article; URL and metadata tracked over time
- **Prices** — one row per product per day (sparse: missing row = not observed that day)
- **Users** — Yandex OAuth profiles with subscription status and access expiry
- **Lists** — user-scoped collections of product URLs, typed for table or graph context

---

## What This Demonstrates

- End-to-end product delivery: UI, API, auth, persistence, and deployment
- TypeScript across frontend and backend
- REST API design with middleware-based authorization
- Interactive data UI (tables, charts, client-side export)
- Containerized production setup with health checks and service dependencies

---

<p align="center">
  <em>Personal project · Full-stack · TypeScript · React · Node.js · PostgreSQL · Docker</em>
</p>
