---
tags: [advanced, plugins, example]
---

# Example Table

This table is deliberately typed messily. Click into it and then leave it (e.g. click outside) — with the Advanced Tables plugin active, the table re-aligns itself automatically.

| Task | Owner | Status | Deadline |
|---|---|---|---|
| API design | Max | Active | 2026-08-20 |
| Frontend integration | Lisa | Open | 2026-08-25 |
| Write tests | Max | Open | 2026-08-27 |
| Deployment | Team | Blocked | 2026-08-30 |

## Try It

1. Put the cursor in the last cell of the last row and press `Tab` — a new row appears
2. Fill in the new row, e.g. `Review | Lisa | Open | 2026-09-01`
3. Sort the table via the Command Palette (`Ctrl+P` → "Advanced Tables: Sort rows ascending") by the "Status" column
4. Move the "Deadline" column to the front with "Move column left"

## Budget Table with Formula

| Category  | Planned | Spent |
| --------- | ------- | ----- |
| Hosting   | 50      | 47    |
| Domains   | 20      | 18    |
| Tools     | 30      | 35    |
| **Total** |         |       |

<!-- TBLFM: @4$2=sum(@2..@3);@4$3=sum(@2..@3) -->

Run "Advanced Tables: Evaluate formulas" to compute the total row.
