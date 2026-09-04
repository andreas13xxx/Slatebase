---
inclusion: manual
---

# Slatebase — Marketingplan

## Ziel

Slatebase als Self-Hosted-Alternative für Obsidian-Vault-Zugriff in der Community bekannt
machen. Zielgruppen: Self-Hoster, Obsidian-Nutzer, PKM-Community, AI/MCP-Interessierte.

Repo ist public, README/About/Demo-GIF stehen, Lizenz ist **AGPL-3.0**, CI/CD veröffentlicht
Multi-Arch-Images auf GHCR (`ghcr.io/andreas13xxx/slatebase-backend` + `-frontend`) und
Release Please erzeugt Releases samt Changelog. Die Grundlagenphase ist damit abgeschlossen.

## Offene Maßnahmen

### Community-Reichweite

| # | Maßnahme | Status | Details |
|---|----------|--------|---------|
| 1 | Post auf r/selfhosted | Entwurf fertig (`.kiro/marketing/reddit-selfhosted.md`) | Flair „Self-Hosted Alternatives", englisch, mit demo.gif + GitHub-Link. Collaboration hervorheben |
| 2 | Post auf r/ObsidianMD | Entwurf fertig (`.kiro/marketing/reddit-obsidianmd.md`) | Flair „Resources & Workflows", englisch. Fokus: Vault-Sharing, Plugin-Kompatibilität, LiveSync |
| 3 | PR an awesome-selfhosted | Geplant | Kategorie: Knowledge Management / Wikis |
| 4 | PR an awesome-obsidian | Geplant | Unter „Tools" oder „Web Access" |
| 5 | Obsidian Discord/Forum Post | Geplant | Kanal: #third-party-tools oder Plugin-Showcase |
| 6 | Show HN | Geplant | Erst wenn Docker-Images stabil sind. Pitch: Self-hosted, no DB, Obsidian-kompatibel, Plugin-Runtime im Browser, MCP-ready |

### Content

| # | Maßnahme | Status | Details |
|---|----------|--------|---------|
| 7 | Blog: Architektur-Entscheidungen | Geplant | „Why no database?", Filesystem-basiert, opake Tokens statt JWT |
| 8 | Blog: MCP-Integration | Geplant | AI-Community ansprechen |
| 9 | Blog/Video: Obsidian-Plugins im Browser | Geplant | Stärkstes technisches Alleinstellungsmerkmal — echte Community-Bundles laufen ohne Electron |
| 10 | Kurzvideo (2–3 Min) | Geplant | Setup → Login → Vault browsen → editieren → teilen → Plugin installieren |
| 11 | Twitter/X Thread | Geplant | Build-in-public Narrative, Screenshots, Learnings |

### Ökosystem

| # | Maßnahme | Status | Details |
|---|----------|--------|---------|
| 12 | MCP-Server im MCP-Verzeichnis listen | Geplant | Server ist implementiert, Listing vorbereiten |
| 13 | Docker Hub Listing zusätzlich zu GHCR | Geplant | Breitere Sichtbarkeit |
| 14 | Vergleichsseite vs. Obsidian Publish / Quartz / BookStack / Wiki.js | Geplant | Tabelle mit ✅/❌ pro Feature |
| 15 | Englische UI als Default | Geplant | i18n ist vorhanden — English als Default für breitere Adoption |

**Reihenfolge:** Reddit-Posts zuerst (größter Hebel für erste Nutzer), dann die
awesome-*-PRs, dann Content. Show HN erst danach.

**Kein eigenes Sync-Plugin:** Ein Custom-`vault-sync`-Modul wurde bewusst verworfen —
stattdessen läuft das echte Community-Plugin „LiveSync" nativ im Plugin-Compat-Layer
(bidirektionale CouchDB-Replikation über den Server-Proxy).

## Differenzierungsmerkmale

In jedem Post, jeder README-Feature-Tabelle und jedem Video prominent:

| Feature | Differenzierung vs. Alternativen |
|---------|----------------------------------|
| **Obsidian Plugin Compatibility** | Echte Community-Plugins laufen im Web-Frontend, inkl. Plugin-Store zum Installieren aus GitHub-Releases. Obsidian Publish: kein Plugin-Support; Quartz/MkDocs: statisch, keine Runtime |
| **Echtzeit-Chat** | Obsidian Publish, Quartz, MkDocs — keines hat Chat |
| **Granulare Vault-Freigaben (Read/Write)** | Obsidian Publish: nur read-only, keine Rechte-Granularität |
| **Vault-Besitz-Transfer** | Nirgends sonst vorhanden — Team-Übergaben ohne Datenverlust |
| **Multi-User mit Rollen (Admin/User)** | Quartz/MkDocs: Single-User; Obsidian Publish: kein Multi-User |
| **MCP-Server mit Lese- UND Schreibzugriff** | AI-Assistenten durchsuchen Vaults und erstellen/bearbeiten/löschen/verschieben Dateien — keine Alternative bietet das |
| **Git-Sync serverseitig** | Vault gegen beliebige Git-Remotes synchronisieren, ohne Client-Software |
| **Mail-Import via IMAP** | Postfächer landen als Markdown-Notizen im Vault — kein Zapier, kein Drittdienst |
| **CouchDB/LiveSync-Kompatibilität** | Bidirektional, intervallbasiert, E2E-verschlüsselt — kompatibel mit obsidian-livesync |
| **Knowledge Graph** | Interaktive Visualisierung inkl. lokalem Graph — Obsidian Publish/Quartz haben keinen interaktiven Graph |
| **Context Panel (Outline, Links, Tags, Properties)** | Interaktiv, splittbar, Drag & Drop. Obsidian Publish: kein Outline/Tags-Panel |
| **Volltextsuche mit Find & Replace** | Vault-weit, Regex, Multi-Vault, Suchoperatoren, Replace mit Bestätigung — die Alternativen haben nur statische Indizes |
| **Eingebaute Rechtschreibprüfung** | Eigene Hunspell-Wörterbücher mit echten Korrekturvorschlägen, nicht die des Browsers |
| **Canvas** | Obsidian-`.canvas`-Whiteboards lesen und bearbeiten |

## Messaging

- **r/selfhosted:** „Collaboration without SaaS" — viele suchen self-hosted
  Notion/Confluence-Alternativen mit Team-Features.
- **r/ObsidianMD:** „Run your plugins, share your vault, chat about notes — all
  self-hosted." Die Plugin-Runtime ist hier der stärkste Hook.
- **Show HN:** „Not just a viewer — Obsidian community plugins running in the browser,
  with CouchDB and git sync."
- **Vergleichsseite:** Tabelle mit ✅/❌ pro Feature vs. Obsidian Publish, Quartz,
  BookStack, Wiki.js.

## Kernbotschaften

1. **„Deine Notizen, dein Server, jeder Browser."** — Self-Hosting + Web-Zugriff
2. **„Obsidian-kompatibel, ohne Obsidian."** — Kein Vendor-Lock-in, inklusive Plugins
3. **„Kein Sync-Dienst, keine Datenbank, keine Magie."** — Transparenz, Plain Files
4. **„Teile Wissen, nicht Accounts."** — Multi-User mit granularen Rechten
5. **„Zusammenarbeiten, nicht nur speichern."** — Chat, Vault-Sharing, Realtime
6. **„Sync, wie es dir passt."** — Git-Remotes serverseitig oder CouchDB via LiveSync
7. **„AI-ready: MCP-Integration für deine Wissensbasis."** — Lesen UND Schreiben

## Erfolgskriterien

| Metrik | Ziel (3 Monate) |
|--------|-----------------|
| GitHub Stars | 50+ |
| Docker Pulls | 100+ |
| Unique Visitors (GitHub Insights) | 500+ |
| Community-Feedback (Issues/Discussions) | 10+ sinnvolle Interaktionen |
| Externe Erwähnungen (Reddit, HN, Blogs) | 3+ |
