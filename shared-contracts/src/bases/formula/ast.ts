/**
 * Bases expression AST — the node types produced by `parser.ts` and consumed
 * by `evaluator.ts`. Extracted into its own module (Phase 1 of the Bases
 * expression-language migration) so the growing node set has one home shared
 * by parser and evaluator.
 *
 * The grammar is the Obsidian Bases expression language (used by BOTH filters
 * and formulas): primitives, property references with `note.`/`file.`/
 * `formula.` prefixes, arithmetic/comparison/logical operators, parenthesised
 * groups, global function calls, member access (`a.b`), indexing (`a[b]`), and
 * method calls (`a.m(args)`).
 */

/** Binary operators: arithmetic, comparison. */
export type BinaryOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | '+' | '-' | '*' | '/' | '%'

/** Logical operators handled separately (short-circuit semantics). */
export type LogicalOp = '&&' | '||'

/** An expression AST node. */
export type ExprNode =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  /** A bare or dotted property reference, e.g. `status`, `note.price`, `file.name`. */
  | { kind: 'property'; name: string }
  /** Unary minus or logical not. */
  | { kind: 'unary'; op: '-' | '!'; operand: ExprNode }
  | { kind: 'binary'; op: BinaryOp; left: ExprNode; right: ExprNode }
  | { kind: 'logical'; op: LogicalOp; left: ExprNode; right: ExprNode }
  /** Global function call, e.g. `if(a, b, c)`, `date("2025-01-01")`. */
  | { kind: 'call'; name: string; args: ExprNode[] }
  /** Member access on a value, e.g. `now().hour`, `datetime.date`. */
  | { kind: 'member'; object: ExprNode; property: string }
  /** Method call on a value, e.g. `price.toFixed(2)`, `tags.contains("x")`. */
  | { kind: 'method'; object: ExprNode; method: string; args: ExprNode[] }
  /** Index access, e.g. `list[0]`, `obj["key"]`. */
  | { kind: 'index'; object: ExprNode; index: ExprNode }

/**
 * Legacy alias kept so existing importers (`evaluateFormula`, tests) keep
 * compiling while the engine is renamed from "formula" to the broader
 * "expression" concept. New code should use `ExprNode`.
 */
export type FormulaNode = ExprNode
