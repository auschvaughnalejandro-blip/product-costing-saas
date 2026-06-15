/**
 * The costing engine. Pure, deterministic, no I/O — the single source of every
 * cost figure in the application. Import `computeCost` and nothing else needs to
 * know how a cost is worked out.
 */
export { computeCost } from './costing';
export { EngineError, isEngineError, type EngineErrorCode } from './errors';
export { Big, money, quantity, MONEY_DECIMALS } from './decimal';
export { widgetExample } from './examples';
