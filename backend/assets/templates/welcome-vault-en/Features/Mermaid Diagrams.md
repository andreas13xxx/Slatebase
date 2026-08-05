---
tags: [features]
---

# Mermaid Diagrams

Mermaid lets you create diagrams directly in Markdown using a text-based syntax. Slatebase renders them automatically in View mode.

![[Screenshots/mermaid-diagramm.png]]

*A rendered Mermaid flowchart*

---

## Basic Syntax

Wrap your Mermaid code in a fenced code block with the language `mermaid`:

````markdown
```mermaid
graph TD
    A[Start] --> B[Process]
    B --> C[End]
```
````

---

## Flowchart

```mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action A]
    B -->|No| D[Action B]
    C --> E[End]
    D --> E
```

### Direction Options

| Code | Direction |
|------|-----------|
| `graph TD` | Top to bottom |
| `graph LR` | Left to right |
| `graph BT` | Bottom to top |
| `graph RL` | Right to left |

---

## Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant Server
    participant Database
    User->>Server: POST /login
    Server->>Database: Query user
    Database-->>Server: User data
    Server-->>User: 200 OK + Token
```

---

## Gantt Chart

```mermaid
gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Planning
        Research       :a1, 2025-01-01, 14d
        Design         :a2, after a1, 7d
    section Implementation
        Development    :b1, after a2, 21d
        Testing        :b2, after b1, 14d
    section Release
        Deployment     :c1, after b2, 3d
```

---

## Pie Chart

```mermaid
pie title Time Distribution
    "Development" : 45
    "Meetings" : 20
    "Documentation" : 15
    "Testing" : 20
```

---

## Class Diagram

```mermaid
classDiagram
    class VaultService {
        +createVault(name)
        +deleteVault(id)
        +getFiles(vaultId)
    }
    class VaultReader {
        +readFile(path)
        +writeFile(path, content)
    }
    VaultService --> VaultReader
```

---

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review
    Review --> Approved
    Review --> Draft : Changes requested
    Approved --> Published
    Published --> [*]
```

---

## Entity Relationship Diagram

ER diagrams describe database models and relationships between entities:

```mermaid
erDiagram
    USER ||--o{ VAULT : owns
    USER ||--o{ SESSION : has
    VAULT ||--o{ FILE : contains
    VAULT ||--o{ SHARE : has
    SHARE }o--|| USER : grants

    USER {
        string id PK
        string username
        string role
        date createdAt
    }
    VAULT {
        string id PK
        string name
        string ownerId FK
    }
    FILE {
        string path PK
        string content
        date modified
    }
```

### Relationship Notation

| Syntax | Meaning |
|--------|---------|
| `\|\|--o{` | One to many |
| `\|\|--\|\|` | One to one |
| `}o--o{` | Many to many |
| `PK` / `FK` | Primary / Foreign key |

---

## Git Graph

Git graphs visualize branch and merge histories:

```mermaid
gitGraph
    commit id: "Initial"
    commit id: "Add README"
    branch feature/login
    commit id: "Login UI"
    commit id: "Auth logic"
    checkout main
    commit id: "Hotfix"
    merge feature/login id: "Merge login"
    commit id: "Release v1.0"
```

### Key Commands

- `commit` — Create a commit on the current branch
- `branch` — Create a new branch
- `checkout` — Switch branches
- `merge` — Merge a branch

---

## User Journey Diagram

User journey maps show a user's step-by-step experience:

```mermaid
journey
    title Getting Started with Slatebase
    section Registration
        Open login page: 5: User
        Enter password: 3: User
        Create vault: 4: User
    section First Note
        Create new file: 5: User
        Write Markdown: 4: User
        Check preview: 5: User
    section Organization
        Create folders: 4: User
        Add wikilinks: 3: User
        Explore graph: 5: User
```

### Syntax

- `title` — Diagram heading
- `section` — Group steps into phases
- `Task: Rating: Actor` — Step with satisfaction score (1–5)

---

## Mindmap

Mindmaps for brainstorming and structuring ideas:

```mermaid
mindmap
    root((Knowledge Management))
        Capture
            Quick Notes
            Daily Notes
            Web Clipper
        Organize
            Folder Structure
            Tags
            Wikilinks
        Visualize
            Knowledge Graph
            Mermaid Diagrams
            Canvas
        Share
            Vault Sharing
            PDF Export
            MCP API
```

### Syntax

- `root((...))` — Central topic (circle shape)
- Indentation defines the hierarchy
- Each line is a node
- Shapes: `(...)` rounded, `[...]` square, `))...((` cloud

---

## Tips for Mermaid

> [!tip] Rendering
> - Diagrams are rendered in View mode (not visible in Edit mode)
> - A timeout of 5 seconds prevents infinite loops
> - If rendering fails, the raw code is shown as fallback
> - Diagrams adapt to the current theme (dark/light mode)

> [!warning] Limitations
> - Very large diagrams may render slowly
> - Not all Mermaid features are supported — stick to the common types listed here
> - Interactive elements (clicks, links) are not supported

---

> [!todo] Exercise
> Create a new file and add a flowchart that describes your morning routine:
> 1. Start with `graph TD`
> 2. Add at least 4 nodes
> 3. Include one decision (diamond shape `{Decision?}`)
> 4. Switch to View mode to see the rendered diagram

---

## Related Features

- [[Basics/Markdown Syntax]] — Code blocks basics
- [[Features/Canvas]] — Visual boards (alternative to diagrams)
- [[Features/Mermaid Advanced]] — More diagram types (Timeline, Sankey, XY Chart, etc.)
- [[Features/Embeds]] — Embedding content
