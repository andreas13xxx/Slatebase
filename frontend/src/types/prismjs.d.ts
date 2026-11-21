/**
 * Hand-written types for `prismjs`, which ships as untyped CommonJS.
 *
 * Only the entry point is declared: `loadPrism()` in the plugin compat layer
 * hands the object to plugins as-is, so it is typed as an opaque record.
 */
declare module 'prismjs' {
  const Prism: Record<string, unknown>;
  export default Prism;
}
