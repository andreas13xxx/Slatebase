---
tags: [advanced, plugins, example]
mixed:
  - Text
  - 42
  - true
  - name: Lisa
    role: Editorial
contacts:
  - name: Max
    phone: "030 1234567"
  - name: Lisa
    phone: "040 7654321"
---

# Example: Mixed List

`mixed` is a list that holds text, a number, a boolean and an object together. `contacts` is a list of objects.

The built-in list editor only knows text entries. Slatebase therefore shows such lists as a nested value, and with the [[Advanced/Plugins/Nested Properties|Nested Properties plugin]] as a group with individually editable entries. The structure of the list is preserved on save.
