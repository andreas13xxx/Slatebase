---
tags: [advanced, plugins, example]
title: Vault Rollout
project:
  status: active
  team:
    lead: Max
    members:
      - Lisa
      - Jonas
  dates:
    start: 2026-09-01
    end: 2026-12-15
  budget:
    amount: 12000
    currency: EUR
    approved: true
---

# Example Project

The `project` object has several levels: `team` (with a `members` list), `dates` and `budget` are sub-objects of their own.

With the [[Advanced/Plugins/Nested Properties|Nested Properties plugin]] enabled, they appear as nested, collapsible groups. Change `amount` or toggle `approved`. Values are drawn in their type (number, boolean, list).
