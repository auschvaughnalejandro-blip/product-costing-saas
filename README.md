# Product Costing SaaS

A web platform that takes the data describing how a product is manufactured, calculates what it costs to make, and lets users adjust values, run "what-if" scenarios, view a full cost breakdown, and produce estimates and quotations.

Cost figures are produced by a deterministic calculation engine — the same inputs always produce the same result. An AI assistant is available throughout the app to explain terms, figures, and breakdowns in plain language. **The AI never produces the cost numbers; the engine does.**

---

## Table of Contents

- [What it does](#what-it-does)
- [How the costing works](#how-the-costing-works)
- [Key features](#key-features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Running with Docker](#running-with-docker)
- [Data sources: Excel and SAP](#data-sources-excel-and-sap)
- [A note on master data](#a-note-on-master-data)
- [Roadmap](#roadmap)
- [Deliverables](#deliverables)

---

## What it does

Manufacturers need to know what a product costs to make before they price it. That number depends on what goes into the product, how it is made, and what each input costs. This platform gathers that data, computes the cost at every level of the product, and presents it in an editable, explorable interface.

The first release is configured for a single customer, but the foundations are built so the same product can serve many customers later.

## How the costing works

A product's cost is calculated from three inputs:

1. **What goes into it** — the bill of materials: every material and part, including parts that are themselves made of smaller parts (a multi-level structure).
2. **How it's made** — the routing: the sequence of operations and the machine/labour time each one takes.
3. **What things cost** — the rates: material prices, labour and machine rates, and overheads.

The engine works through every level of the product and totals the cost:

| Cost component | How it's calculated |
| --- | --- |
| Material cost | Quantity of each material needed × its price, across the whole product |
| Labour cost | Time each operation takes × labour rate |
| Machine cost | Time each operation takes × machine rate |
| Overhead | A percentage or share added on top |
| **Total cost** | **All of the above added together** |

Because the calculation is deterministic, results are accurate and repeatable — a requirement for any number people will base real business decisions on.

## Key features

- **Excel upload** as the primary way to get data in.
- **Multi-level costing engine** that rolls cost up through every level of the product.
- **Editable web interface** — a tree/table view where users adjust quantities, rates, and cost values directly and see totals recalculate.
- **Cost versions** — save and reload drafts and finals.
- **Estimation & quotation forms** built from the costed product.
- **Workflow approvals** for moving a cost version through review.
- **AI assistant** available everywhere in the app for definitions, cost explanations, simpler shareable views, Excel clean-up suggestions, and quick "what-if" questions.
- **SAP S/4HANA connection** as a second data source, added on top of Excel.

## Tech stack

| Layer | Technology | Why |
| --- | --- | --- |
| Frontend | React (Vite) | Modern web app; no mobile or public-SEO requirement |
| Cost tables | AG Grid / TanStack Table | Built for editable, multi-level data grids |
| Backend | Node.js | Application logic, accounts, core services |
| Costing engine | Node.js | Deterministic calculation engine |
| Database | PostgreSQL | Reliable structured storage; SaaS standard |
| AI | Google Gemini API (via a swappable adapter) | Powers the in-app assistant; provider can be changed later |
| Deployment | Docker | Same build runs locally and in the cloud |

The AI is connected through a **swappable provider layer**, so Gemini can be replaced with another model later without rebuilding the app. The initial release targets ~5 concurrent users.

## Architecture

```
┌──────────────────────────────────────────────┐
│             Browser — React (Vite)            │
│   Tree/table view · editing · quotations ·    │
│        AI assistant panel · approvals         │
└───────────────────────┬──────────────────────┘
                        │  HTTPS / REST
┌───────────────────────▼──────────────────────┐
│                Node.js backend                │
│  Auth · API · cost versions · quotations ·    │
│              approval workflow                │
│  ┌─────────────────────────────────────────┐ │
│  │   Costing engine (pure, deterministic)  │ │
│  └─────────────────────────────────────────┘ │
│  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Excel parser │  │  AI provider adapter   │ │
│  └──────────────┘  └────────────────────────┘ │
│  ┌──────────────┐                             │
│  │ SAP connector│ (added once access granted) │
│  └──────────────┘                             │
└──────┬───────────────────┬──────────────┬─────┘
       │                   │              │
┌──────▼──────┐   ┌────────▼──────┐  ┌────▼──────────┐
│ PostgreSQL  │   │  Gemini API   │  │  SAP S/4HANA  │
│ (all data)  │   │  (AI chat)    │  │ (rate source) │
└─────────────┘   └───────────────┘  └───────────────┘

        Everything packaged with Docker
```

The key design rule: the **costing engine is a pure module** — it takes data in, returns numbers out, with no database or network calls inside it. That makes it easy to test, easy to trust, and reusable.

## Project structure

```
product-costing-saas/
├── apps/
│   ├── web/                  # React (Vite) frontend
│   │   ├── src/
│   │   │   ├── components/    # Grid, tree, panels
│   │   │   ├── features/      # costing, quotation, approvals, assistant
│   │   │   ├── lib/           # api client, formatting
│   │   │   └── main.tsx
│   │   └── vite.config.ts
│   └── api/                  # Node.js backend
│       ├── src/
│       │   ├── engine/        # costing engine (pure, no I/O)
│       │   ├── ingestion/     # excel parsing + validation
│       │   ├── integrations/  # sap connector, ai adapter
│       │   ├── modules/       # products, versions, quotations, approvals
│       │   ├── db/            # migrations, queries
│       │   └── server.ts
│       └── package.json
├── packages/
│   └── shared/               # types shared between web and api
├── docker-compose.yml
├── Dockerfile.web
├── Dockerfile.api
└── README.md
```

> The exact folder names are a suggestion; the important separation is **engine vs. application vs. interface**.

## Getting started

### Prerequisites

- Node.js 20+ and npm
- Docker and Docker Compose
- A PostgreSQL instance (or use the one in `docker-compose.yml`)
- A Google Gemini API key

### Install and run (local development)

```bash
# 1. Clone and install
git clone <repo-url>
cd product-costing-saas
npm install

# 2. Start the database
docker compose up -d db

# 3. Configure environment
cp .env.example .env
# edit .env and fill in the values

# 4. Run database migrations
npm run db:migrate

# 5. Start backend and frontend
npm run dev
```

The frontend runs on `http://localhost:5173` and the API on `http://localhost:3000` by default.

## Environment variables

Create a `.env` from `.env.example`:

```
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/costing

# Server
PORT=3000
NODE_ENV=development

# AI
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key_here

# SAP (optional until access is granted)
SAP_BASE_URL=
SAP_CLIENT=
SAP_USERNAME=
SAP_PASSWORD=
```

The app runs fully without the SAP values — leave them blank until the client provides access.

## Running with Docker

```bash
# Build and run everything (db, api, web)
docker compose up --build
```

The same images run in the cloud; only the environment variables and the database connection change. The detailed cloud configuration is finalised in a technical planning session.

## Data sources: Excel and SAP

The app has two ways to get product and rate data in:

- **Excel** — the primary input. Upload a spreadsheet in the expected format. If the file doesn't match the format, the AI assistant suggests a corrected version for the user to **approve before it is used**.
- **SAP S/4HANA** — a direct connection that pulls cost data from the client's SAP system, added on top of Excel. It depends on the client providing a test system, credentials, network access, and IT/security sign-off, so it is scheduled toward the end. **Every other feature works on Excel alone**, so any delay in SAP access does not hold up the rest of the platform.

## A note on master data

Material prices, labour rates, and machine rates are **master data** — negotiated internally between the company and its suppliers/staff. These figures are **not** something the AI fetches from the internet, and the system does not try to. They come from one of two trusted places:

1. The user enters them, or
2. They are pulled from SAP, where the company already maintains them.

The AI assistant's role is to **explain** these numbers, not to source or invent them.

## Roadmap

Planned for later phases, after the first customer is live and validated:

- **Multi-customer (multi-tenant) capabilities** — separate sign-ups, data separation between customers, per-customer settings, and billing.
- **Should-cost estimation** — suggesting what a product *should* cost.
- **Anomaly detection** — automatically flagging unusual or out-of-line costs.

## Deliverables

1. **Working application** — costing engine, web interface, AI assistant, estimation/quotation, approvals, and the in-scope SAP connection.
2. **Source code** — the complete codebase.
3. **Documentation** — setup and usage docs.
4. **Deployment guide** — running the app locally and in the cloud.

---

*Built by EBITA AI Private Limited · contact@ebita.ai · ebita.ai*