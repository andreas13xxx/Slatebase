---
tags: [advanced, plugins, example]
name: Berlin Office
address:
  street: Example Street 1
  zip: "10115"
  city: Berlin
  geo:
    latitude: 52.52
    longitude: 13.405
---

# Example Address

This note has nested frontmatter: `address` is an object, and inside it `geo` is another object with `latitude` and `longitude`.

With the [[Advanced/Plugins/Nested Properties|Nested Properties plugin]] enabled, `address` appears in the properties editor as a collapsible group. Expand it, then `geo`, and change the coordinates. Without the plugin, the editor shows `address` as a YAML field.

Switch to source mode to see the change in the frontmatter.
