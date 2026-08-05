---
tags: [features, advanced]
---

# Mermaid — Advanced Diagram Types

Beyond the core diagram types (Flowchart, Sequence, Gantt, Pie, Class, State, ER, Git, Journey, Mindmap), Mermaid offers additional specialized visualizations.

> [!info] Version
> These diagram types are available from Mermaid 11.x onwards. Some are experimental (beta).

---

## Timeline

Timeline diagrams display chronological events:

```mermaid
timeline
    title Slatebase Release History
    2024-01 : Project started
            : First prototypes
    2024-03 : Multi-vault support
            : Auth system
    2024-06 : Plugin compatibility
            : Realtime SSE
    2024-09 : Knowledge Graph
            : Canvas Editor
    2025-01 : Live Preview
            : MCP Server
    2025-06 : Mermaid 11.16
            : Advanced diagrams
```

**Syntax:**
- `title` — Diagram heading
- `Date : Event` — Time point with description
- Multiple events per time point with additional `: Text` lines

---

## Quadrant Chart

Quadrant charts position items in a 2x2 grid:

```mermaid
quadrantChart
    title Feature Prioritization
    x-axis "Low Effort" --> "High Effort"
    y-axis "Low Impact" --> "High Impact"
    quadrant-1 "Quick Wins"
    quadrant-2 "Strategic"
    quadrant-3 "Avoid"
    quadrant-4 "Reconsider"
    "Dark Mode": [0.2, 0.8]
    "Plugin System": [0.8, 0.9]
    "Mobile App": [0.9, 0.6]
    "Syntax Highlight": [0.3, 0.7]
    "PDF Export": [0.5, 0.5]
    "Emoji Picker": [0.2, 0.2]
    "Offline Sync": [0.7, 0.4]
```

**Syntax:**
- `x-axis` / `y-axis` — Axis labels with direction
- `quadrant-1` to `quadrant-4` — Quadrant labels (counter-clockwise from top-right)
- `"Label": [x, y]` — Position an item (values 0–1)

---

## XY Chart

XY charts for line and bar diagrams with numeric axes:

```mermaid
xychart-beta
    title "Vault Growth (Files per Month)"
    x-axis ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    y-axis "Files" 0 --> 200
    bar [20, 45, 67, 89, 134, 178]
    line [20, 45, 67, 89, 134, 178]
```

**Syntax:**
- `x-axis [...]` — Categories or numeric values
- `y-axis "Label" min --> max` — Value range
- `bar [...]` — Bar data
- `line [...]` — Line data

---

## Sankey Diagram

Sankey diagrams show flows and their quantities:

```mermaid
sankey-beta

"Incoming Notes","Processed",60
"Incoming Notes","Archived",25
"Incoming Notes","Deleted",15
"Processed","Published",35
"Processed","In Progress",25
"Archived","Reference",20
"Archived","Forgotten",5
```

**Syntax:**
- Pure CSV format: `"Source","Target",Amount`
- Each line defines a flow
- Empty lines allowed for visual separation
- Band width corresponds to the amount

---

## Architecture Diagram

Architecture diagrams for system and infrastructure visualization:

```mermaid
architecture-beta
    group cloud(cloud)[Cloud]
    group backend(server)[Backend] in cloud
    group frontend(server)[Frontend] in cloud

    service api(server)[API Server] in backend
    service db(database)[Database] in backend
    service web(internet)[Web App] in frontend
    service cdn(internet)[CDN] in frontend

    web:R --> L:api
    api:R --> L:db
    cdn:B --> T:web
```

**Syntax:**
- `group name(icon)[Label]` — Grouping
- `service name(icon)[Label] in group` — Service within a group
- `service:Side --> Side:service` — Connections (L/R/T/B)

---

## Kanban Board

Kanban boards for task management:

```mermaid
kanban
    column1["To Do"]
        task1["Update Mermaid docs"]
        task2["Write tests"]
        task3["Code review"]
    column2["In Progress"]
        task4["Extend plugin system"]
        task5["Optimize performance"]
    column3["Done"]
        task6["Dark Mode"]
        task7["SSE Events"]
```

**Syntax:**
- `column["Label"]` — Define a column
- Indented `task["Label"]` — Tasks within the column

---

## Packet Diagram

Packet diagrams for network protocol structures:

```mermaid
packet-beta
    0-15: "Source Port"
    16-31: "Destination Port"
    32-63: "Sequence Number"
    64-95: "Acknowledgment Number"
    96-99: "Data Offset"
    100-105: "Reserved"
    106-111: "Flags"
    112-127: "Window Size"
    128-143: "Checksum"
    144-159: "Urgent Pointer"
```

**Syntax:**
- `Start-End: "Label"` — Bit range with label
- Visualizes network packet structures or binary formats

---

## Block Diagram

Block diagrams for hierarchical system structures:

```mermaid
block-beta
    columns 3
    space:2 Frontend
    Backend["Backend API"]:2 Database[("DB")]
    space:3
    Auth Vault Search
```

**Syntax:**
- `columns N` — Set number of columns
- `Name["Label"]` — Block with custom label
- `space` — Empty cell
- `:N` — Block spanning N columns

---

## More Experimental Types

The following diagram types are available in newer Mermaid versions but may not yet be stable in all environments:

- **Radar Chart** (`radar-beta`) — Spider diagrams for multi-dimensional comparisons
- **Treemap** (`treemap`) — Hierarchical area visualization
- **Venn** (`venn`) — Set diagrams
- **Cynefin** (`cynefin-beta`) — Decision framework
- **Wardley Map** (`wardley`) — Strategic visualization

> [!info] Verify Syntax
> Test new diagram types in the [Mermaid Live Editor](https://mermaid.live/) — it always uses the latest Mermaid version.

---

## Notes on Advanced Types

> [!warning] Beta Status
> Diagrams with the `-beta` suffix (e.g. `xychart-beta`, `sankey-beta`) are experimental and may change in future versions.

> [!tip] Compatibility
> - Not all advanced types render identically in every Mermaid environment
> - Test your diagrams in Slatebase View mode
> - If issues arise: verify syntax in the [Mermaid Live Editor](https://mermaid.live/)

---

> [!todo] Exercise
> 1. Create a Timeline diagram of your project milestones
> 2. Build a Quadrant Chart for your feature prioritization
> 3. Try a Sankey diagram for your workflow

---

## Related Features

- [[Features/Mermaid Diagrams]] — Core diagram types (Flowchart, Sequence, Gantt, etc.)
- [[Features/Canvas]] — Freeform diagrams with drag & drop
- [[Basics/Markdown Syntax]] — Code blocks basics
