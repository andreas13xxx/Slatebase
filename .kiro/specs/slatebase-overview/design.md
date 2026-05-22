# Design Document

## Overview

Slatebase ist ein selbst-gehosteter, AI-nativer Knowledge-Context-Server für Markdown-Vaults. Das Design basiert auf einem modularen Monolith mit folgenden Kernentscheidungen:

- **Modular Monolith**: Single deployable binary mit internen Modulgrenzen
- **Embedding-Modelle**: Unterstützung für lokale (Ollama) und externe (OpenAI) Modelle
- **Plugin-Kompatibilität**: Nur Daten-Plugins, keine UI-Plugins
- **Graph Store**: Eigene Implementierung auf CouchDB-Views

Das Design ist HIGH-LEVEL gehalten, um kostspieliges Redesign während inkrementeller Implementierung zu vermeiden.

## Architecture

### Frontend-Architektur (Client Layer)

Die Web App ist eine Single-Page Application (SPA) mit folgenden Hauptkomponenten:

- **Vault Viewer Shell**: Layout-Container mit Sidebar (Datei_Explorer) und Hauptbereich (Tab-Leiste + Content)
- **Datei_Explorer**: Baumansicht-Komponente, kommuniziert mit Vault Service REST API
- **Tab Manager**: Client-seitige Zustandsverwaltung für geöffnete Tabs (max. 20)
- **Markdown Renderer**: Rendert Markdown mit Obsidian-Syntax (Wikilinks, Embeds, Frontmatter)
- **Markdown Editor**: Bearbeitungskomponente mit Live-Preview, kommuniziert mit Editor Service
- **Knowledge Graph View**: Canvas-basierte Graph-Visualisierung (Zoom, Pan, Klick-Navigation)
- **i18n Provider**: Stellt Übersetzungen und Locale-Formatierung bereit

Die Frontend-Komponenten kommunizieren ausschließlich über die REST/WebSocket APIs mit dem Backend. Zustandsverwaltung (Tabs, aktiver Vault, Editor-State) liegt vollständig im Client.

### Backend-Architektur (Schichtenmodell)

```
┌─────────────────────────────────────────────────────────────────┐
│ CLIENT LAYER                                                    │
│ (Web App, Obsidian, AI Tools, MCP Clients)                     │
└─────────────────────────────────────────────────────────────────┘
                            │
                    (HTTPS, WebSocket, MCP)
                            │
┌─────────────────────────────────────────────────────────────────┐
│ API GATEWAY / ROUTER                                            │
│ (Auth, Rate Limiting, i18n Header, CORS)                       │
└─────────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────────┐
│ SERVICE LAYER (Modular Monolith)                               │
│                                                                 │
│ ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│ │ Auth Service    │  │ Vault Service│  │ Editor Service   │   │
│ │ (JWT, Sessions) │  │ (CRUD, Exp.) │  │ (Parse, Preview) │   │
│ └─────────────────┘  └──────────────┘  └──────────────────┘   │
│                                                                 │
│ ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│ │ Knowledge Graph  │  │ Sync Service │  │ AI Context Svc   │   │
│ │ Service          │  │ (CouchDB,    │  │ (Semantic Search,│   │
│ │ (Links, Graph)   │  │  LiveSync)   │  │  Embeddings)     │   │
│ └──────────────────┘  └──────────────┘  └──────────────────┘   │
│                                                                 │
│ ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│ │ MCP Server       │  │ i18n Service │  │ Plugin Runtime   │   │
│ │ (Protocol, Tools)│  │ (Locales)    │  │ (Sandbox, Data)  │   │
│ └──────────────────┘  └──────────────┘  └──────────────────┘   │
│                                                                 │
│ Cross-cutting: a11y (WCAG 2.1 AA)                              │
└─────────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────────┐
│ DATA LAYER                                                      │
│                                                                 │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│ │ CouchDB      │  │ Vector Store │  │ Graph Store (CouchDB │   │
│ │ (Documents,  │  │ (Embeddings) │  │  Views)              │   │
│ │  Sync)       │  │              │  │ (Links, Backlinks)   │   │
│ └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                 │
│ ┌──────────────┐  ┌──────────────┐                             │
│ │ Blob Storage │  │ Auth Store   │                             │
│ │ (Media)      │  │ (Users)      │                             │
│ └──────────────┘  └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Auth Service
- **Verantwortung**: Benutzer-Authentifizierung, Session-Management, Token-Verwaltung
- **Schnittstellen**: 
  - REST API: `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/verify`
  - Interne API: `verifyToken()`, `createSession()`, `invalidateSession()`
- **Datenquellen**: Auth Store (Users, Tokens, Sessions)

### Vault Service
- **Verantwortung**: Vault-CRUD, Datei-Explorer, Import/Export, Wikilink-Auflösung
- **Schnittstellen**:
  - REST API: `/vaults`, `/vaults/{id}/files`, `/vaults/{id}/import`, `/vaults/{id}/export`
  - Interne API: `getVault()`, `listFiles()`, `resolveWikilink()`, `importVault()`, `exportVault()`
- **Datenquellen**: CouchDB (Vault-Dokumente, Datei-Metadaten)

### Editor Service
- **Verantwortung**: Markdown-Parsing, Live-Preview, Konflikt-Erkennung, Obsidian-Syntax-Unterstützung
- **Schnittstellen**:
  - REST API: `/files/{id}/content`, `/files/{id}/preview`, `/files/{id}/save`
  - Interne API: `parseMarkdown()`, `generatePreview()`, `detectConflicts()`, `saveFile()`
- **Datenquellen**: CouchDB (Datei-Inhalte, Revisions)

### Knowledge Graph Service
- **Verantwortung**: Link-Extraktion, Graph-Berechnung, lokale/globale Ansichten, verwaiste Dateien
- **Schnittstellen**:
  - REST API: `/vaults/{id}/graph`, `/vaults/{id}/graph/local/{fileId}`
  - Interne API: `extractLinks()`, `computeGraph()`, `getLocalGraph()`, `findOrphans()`
- **Datenquellen**: Graph Store (CouchDB Views mit Link-Relationen)

### Sync Service
- **Verantwortung**: CouchDB-Replikation, LiveSync-Protokoll, Konflikt-Auflösung, Sync-Status
- **Schnittstellen**:
  - REST API: `/vaults/{id}/sync/status`, `/vaults/{id}/sync/resolve`
  - Interne API: `initializeSync()`, `resolveConflict()`, `getSyncStatus()`
- **Datenquellen**: CouchDB (Replikation, Konflikt-Metadaten)

### AI Context Service
- **Verantwortung**: Semantische Suche, Chunking/Embedding-Pipeline, RAG-Kontext-Zusammenstellung
- **Schnittstellen**:
  - REST API: `/vaults/{id}/search`, `/vaults/{id}/context`
  - Interne API: `semanticSearch()`, `chunkDocument()`, `embedChunk()`, `buildContext()`
- **Datenquellen**: Vector Store (Embeddings), CouchDB (Dokumente)
- **Externe Integration**: Lokale Modelle (Ollama) oder externe APIs (OpenAI, etc.)

### MCP Server
- **Verantwortung**: Model Context Protocol Implementierung, Ressourcen-Exposition, Tool-Registrierung
- **Schnittstellen**:
  - MCP Protocol: Ressourcen (Vault-Inhalte), Tools (Suche, Navigation, Abruf)
  - Interne API: `exposeResource()`, `registerTool()`, `handleMCPRequest()`
- **Datenquellen**: Alle Services (über interne APIs)

### i18n Service
- **Verantwortung**: Locale-Management, Übersetzungssystem, Format-Lokalisierung
- **Schnittstellen**:
  - REST API: `/i18n/locales`, `/i18n/translations/{locale}`
  - Interne API: `getTranslation()`, `formatDate()`, `formatNumber()`
- **Datenquellen**: Übersetzungs-Dateien (JSON/YAML)

### Plugin Runtime
- **Verantwortung**: Sandbox-Ausführung von Daten-Plugins, Obsidian-API-Kompatibilität
- **Schnittstellen**:
  - Plugin API: Obsidian-kompatible Daten-API (Subset)
  - Interne API: `loadPlugin()`, `executePlugin()`, `unloadPlugin()`
- **Datenquellen**: Plugin-Dateien, Vault-Daten (über Vault Service)
- **Sicherheit**: V8 Isolates oder Web Workers für Sandbox-Isolation

### a11y (Cross-cutting)
- **Verantwortung**: WCAG 2.1 Level AA Konformität über alle Services
- **Anforderungen**:
  - Semantisches HTML, ARIA-Attribute
  - Tastaturnavigation
  - Farbkontraste (4.5:1 für normalen Text)
  - Fokus-Indikatoren
  - Zoom-Kompatibilität (bis 200%)

## Data Models

### CouchDB (Document Store)
- **Primäre Datenbank** für Vault-Inhalte, Metadaten, Revisions
- **Replikation**: Unterstützt LiveSync-Protokoll für Obsidian-Sync
- **Konflikt-Handling**: Multi-Version Concurrency Control (MVCC)
- **Datenmodell**:
  - `vaults/{vaultId}`: Vault-Metadaten
  - `files/{fileId}`: Datei-Inhalte, Frontmatter, Revisions
  - `links/{linkId}`: Wikilink-Relationen (für Graph Store)

### Vector Store (Embeddings)
- **Pluggable Backend**: Unterstützt lokale (Ollama) und externe (OpenAI) Modelle
- **Datenmodell**:
  - `embeddings/{chunkId}`: Vektor + Metadaten (Datei-ID, Position, Text)
- **Trigger**: Automatische Embedding-Pipeline bei Datei-Änderungen

### Graph Store (CouchDB Views)
- **Implementierung**: CouchDB Map/Reduce Views für Link-Relationen
- **Datenmodell**:
  - `links`: Alle Wikilinks (Quelle → Ziel)
  - `backlinks`: Umgekehrte Links (Ziel ← Quelle)
  - `adjacency`: Nachbar-Dateien für lokale Graph-Ansicht
  - `orphans`: Dateien ohne Links

### Blob Storage
- **Speicherung**: Medien-Dateien (Bilder, PDFs, Audio)
- **Implementierung**: Dateisystem oder S3-kompatibel
- **Referenzierung**: Über CouchDB-Attachments oder externe URLs

### Auth Store
- **Speicherung**: Benutzer, Tokens, Sessions
- **Implementierung**: SQLite oder CouchDB (je nach Deployment)
- **Sicherheit**: Passwort-Hashing (bcrypt), Token-Expiration

### Konfigurationsmodell

Instanz-weite Konfiguration wird über Umgebungsvariablen und eine optionale Konfigurationsdatei (`slatebase.config.yaml`) gesteuert:

- **Embedding-Provider**: `EMBEDDING_PROVIDER=local|external` (Umgebungsvariable)
  - Lokal: `OLLAMA_URL`, `OLLAMA_MODEL` (z.B. `nomic-embed-text`)
  - Extern: `OPENAI_API_KEY`, `OPENAI_EMBEDDING_MODEL` (z.B. `text-embedding-3-small`)
- **CouchDB**: `COUCHDB_URL`, `COUCHDB_USER`, `COUCHDB_PASSWORD`
- **Vector Store**: `VECTOR_DB_URL`, `VECTOR_DB_TYPE` (qdrant|chroma|milvus)
- **Server**: `PORT`, `HOST`, `TLS_CERT`, `TLS_KEY`
- **Auth**: `JWT_SECRET`, `TOKEN_EXPIRY` (default: 24h)

Die Konfiguration wird beim Start einmalig geladen. Änderungen erfordern einen Neustart. Sensible Werte (Secrets) werden ausschließlich über Umgebungsvariablen gesetzt, nicht über die Konfigurationsdatei.

## Correctness Properties

Die folgenden Korrektheitseigenschaften müssen durch die Implementierung gewährleistet werden:

### Property 1: Vault-Isolation

Dateizugriffe eines Benutzers sind auf seine Vaults beschränkt. Ein Benutzer kann nicht auf Dateien anderer Benutzer oder anderer Vaults zugreifen.

**Validates: Requirements 1.3, 2.4**

### Property 2: Graph-Konsistenz

Der Graph Store bildet alle Wikilinks korrekt als Kanten ab, unabhängig davon ob die Zieldatei existiert. Nicht-aufgelöste Links werden als solche markiert, aber dennoch im Graphen repräsentiert. Bei Datei-Erstellung, -Umbenennung oder -Löschung wird der Graph Store konsistent aktualisiert.

**Validates: Requirements 4.4, 5.1, 5.2, 8.1**

### Property 3: Sync-Konsistenz

CouchDB-Replikation mit Obsidian ist bidirektional und konfliktfrei. Änderungen in Obsidian werden zu Slatebase repliziert und umgekehrt.

**Validates: Requirements 11.1, 11.2, 11.3**

### Property 4: Embedding-Aktualität

Vector Store wird bei jeder Dateiänderung aktualisiert. Semantische Suche findet immer aktuelle Inhalte.

**Validates: Requirements 9.1, 9.2**

### Property 5: Auth-Sicherheit

Nur authentifizierte Benutzer können auf geschützte Ressourcen zugreifen. Tokens sind zeitlich begrenzt und können invalidiert werden.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 6: Plugin-Isolation

Plugins können nicht auf Daten außerhalb ihres Vaults zugreifen. Plugin-Fehler beeinträchtigen nicht den Kern-Betrieb.

**Validates: Requirements 6.3, 6.4**

## Error Handling

Fehlerbehandlung folgt diesen Prinzipien:

- **Graceful Degradation**: Fehler in optionalen Services (z.B. Embedding) beeinträchtigen nicht den Kern-Betrieb
- **Konflikt-Auflösung**: Sync-Konflikte werden erkannt und dem Benutzer zur Auflösung angeboten
- **Validierung**: Eingaben werden auf allen Schichten validiert (API, Service, Data)
- **Logging**: Alle Fehler werden protokolliert für Debugging und Monitoring

## Testing Strategy

Die Testingstrategie umfasst:

1. **Unit Tests**: Pro Service, fokussiert auf Geschäftslogik
2. **Integration Tests**: Service-Interaktionen, besonders Sync und Graph-Berechnung
3. **Property-Based Tests**: Korrektheitseigenschaften (Vault-Isolation, Link-Konsistenz)
4. **End-to-End Tests**: Komplette Workflows (Datei-Bearbeitung, Sync, Suche)
5. **Performance Tests**: Graph-Berechnung bei großen Vaults, Embedding-Pipeline

## Deployment Model

### Docker Compose (Self-hosted)
```yaml
services:
  slatebase-server:
    image: slatebase:latest
    ports: [8080]
    environment:
      - COUCHDB_URL=http://couchdb:5984
      - VECTOR_DB_URL=http://vector-db:8000
      - EMBEDDING_MODEL=local|external
  
  couchdb:
    image: couchdb:latest
    ports: [5984]
    volumes: [couchdb-data]
  
  vector-db:
    image: qdrant|chroma|milvus
    ports: [8000]
    volumes: [vector-data]
  
  reverse-proxy:
    image: nginx:latest
    ports: [443]
    volumes: [tls-certs, nginx-config]
```

## Data Flow Examples

### Datei-Bearbeitung (Editor Service)
1. Client sendet Änderung an `/files/{id}/save`
2. Editor Service validiert Markdown-Syntax
3. Vault Service speichert in CouchDB
4. AI Context Service triggert Embedding-Pipeline
5. Knowledge Graph Service aktualisiert Link-Relationen
6. Sync Service repliziert zu Obsidian (LiveSync)

### Semantische Suche (AI Context Service)
1. Client sendet Query an `/vaults/{id}/search`
2. AI Context Service embeddet Query
3. Vector Store findet ähnliche Chunks
4. Vault Service lädt vollständige Dokumente
5. Ergebnisse werden mit Metadaten zurückgegeben

### MCP-Anfrage (MCP Server)
1. MCP-Client verbindet sich mit MCP Server
2. MCP Server exponiert Vault-Ressourcen
3. Client fragt Ressource oder Tool an
4. MCP Server delegiert an entsprechenden Service
5. Ergebnis wird im MCP-Format zurückgegeben

## Architektur-Prinzipien

Diese Prinzipien leiten zukünftige Detailspezifikationen:

1. **Modularität**: Jeder Service hat klare Verantwortung und Schnittstellen
2. **Daten-Isolation**: Vaults sind voneinander isoliert (Multi-Tenancy)
3. **Extensibility**: Plugin Runtime und MCP Server ermöglichen Erweiterungen
4. **Offline-first**: CouchDB-Replikation ermöglicht Offline-Arbeit
5. **AI-native**: Vector Store und AI Context Service sind zentral, nicht optional
6. **Self-hosted**: Keine Cloud-Abhängigkeiten, lokale Embedding-Modelle möglich
7. **Accessibility**: a11y ist Cross-cutting Concern, nicht nachgelagert

## Technology Stack (Kandidaten)

| Komponente | Kandidaten |
|-----------|-----------|
| Server Runtime | Node.js, Rust, Go |
| Web Framework | Express, Actix, Gin |
| CouchDB Client | pouchdb-node, couchdb-rs |
| Vector DB | Qdrant, Chroma, Milvus |
| Embedding Models | Ollama (lokal), OpenAI API (extern) |
| Plugin Runtime | V8 Isolates, Web Workers |
| Frontend | React, Svelte, Vue |
| Deployment | Docker, Docker Compose |

## Open Questions for Detailed Specs

Diese Fragen sollten in zukünftigen Feature-Spezifikationen geklärt werden:

1. **Server Runtime**: Node.js (schnelle Entwicklung) vs. Rust (Performance)?
2. **Vector DB**: Qdrant (Rust, performant) vs. Chroma (Python, einfach)?
3. **Plugin Sandbox**: V8 Isolates (komplex) vs. Web Workers (einfacher)?
4. **Auth Store**: SQLite (einfach) vs. CouchDB (konsistent)?
5. **Blob Storage**: Dateisystem (einfach) vs. S3 (skalierbar)?
6. **Frontend Framework**: React (Ökosystem) vs. Svelte (Größe)?
