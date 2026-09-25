/**
 * Pure order-ticket rules shared by every order entry surface. Mirrors what OrderGateway and
 * Kite enforce so the trader hears about a problem before submitting, not from a broker error.
 */

export type TicketSide = "BUY" | "SELL";
export type TicketOrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";

export interface OrderLimits {
  killSwitchActive: boolean;
  maxOrderQty: number;
  /** null when the user has not set one; the backend then skips the value check. */
  maxOrderValue: number | null;
  freezeLimit: number;
}

export interface TicketInput {
  side: TicketSide;
  orderType: TicketOrderType;
  product: string;
  qty: number;
  price: number;
  triggerPrice: number;
  ltp: number;
  availableMargin: number;
  marginRequired: number;
  tickSize?: number;
  lotSize?: number;
  limits?: OrderLimits;
}

export interface TicketIssue {
  field: "qty" | "price" | "triggerPrice" | "form";
  severity: "error" | "warning";
  message: string;
}

/** Orders at or above this value (or any market-type order) need an explicit confirm click. */
export const CONFIRM_VALUE_THRESHOLD = 100_000;
/** A limit price further than this from LTP is probably a typo. */
export const PRICE_DEVIATION_WARN = 0.1;

const isMarketType = (t: TicketOrderType) => t === "MARKET" || t === "SL-M";
const hasPrice = (t: TicketOrderType) => t === "LIMIT" || t === "SL";
const hasTrigger = (t: TicketOrderType) => t === "SL" || t === "SL-M";

export function isTickMultiple(value: number, tick: number): boolean {
  if (!(tick > 0)) return true;
  const steps = value / tick;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

export function snapToTick(value: number, tick: number): number {
  if (!(tick > 0)) return value;
  return Number((Math.round(value / tick) * tick).toFixed(4));
}

/** Notional the exchange/gateway will see: the limit price, or LTP for market-type orders. */
export function orderValue(t: Pick<TicketInput, "orderType" | "price" | "ltp" | "qty">): number {
  const px = hasPrice(t.orderType) ? t.price : t.ltp;
  return Math.max(0, px) * Math.max(0, t.qty);
}

export function validateTicket(t: TicketInput): TicketIssue[] {
  const issues: TicketIssue[] = [];
  const err = (field: TicketIssue["field"], message: string) => issues.push({ field, severity: "error", message });
  const warn = (field: TicketIssue["field"], message: string) => issues.push({ field, severity: "warning", message });

  if (t.limits?.killSwitchActive) {
    err("form", "Kill switch is active. New orders are blocked until you reset it.");
  }

  if (!Number.isInteger(t.qty) || t.qty < 1) {
    err("qty", "Quantity must be a whole number of at least 1");
  } else {
    if (t.lotSize && t.lotSize > 1 && t.qty % t.lotSize !== 0) {
      err("qty", `Quantity must be a multiple of the lot size (${t.lotSize})`);
    }
    if (t.limits) {
      if (t.qty > t.limits.maxOrderQty) err("qty", `Exceeds your max order quantity of ${t.limits.maxOrderQty}`);
      else if (t.qty > t.limits.freezeLimit) err("qty", `Exceeds the exchange freeze limit of ${t.limits.freezeLimit}`);
    }
  }

  if (hasPrice(t.orderType)) {
    if (!(t.price > 0)) err("price", "Enter a price greater than 0");
    else if (!isTickMultiple(t.price, t.tickSize ?? 0)) err("price", `Price must be a multiple of the tick size (${t.tickSize})`);
    else if (t.ltp > 0 && Math.abs(t.price - t.ltp) / t.ltp > PRICE_DEVIATION_WARN) {
      warn("price", `Price is more than ${Math.round(PRICE_DEVIATION_WARN * 100)}% away from the last price`);
    }
  }

  if (hasTrigger(t.orderType)) {
    if (!(t.triggerPrice > 0)) err("triggerPrice", "Enter a trigger price greater than 0");
    else if (!isTickMultiple(t.triggerPrice, t.tickSize ?? 0)) {
      err("triggerPrice", `Trigger must be a multiple of the tick size (${t.tickSize})`);
    } else if (t.orderType === "SL" && t.price > 0) {
      if (t.side === "BUY" && t.triggerPrice > t.price) err("triggerPrice", "For a BUY SL order the trigger must not exceed the price");
      if (t.side === "SELL" && t.triggerPrice < t.price) err("triggerPrice", "For a SELL SL order the trigger must not be below the price");
    }
  }

  const value = orderValue(t);
  if (t.limits?.maxOrderValue && value > t.limits.maxOrderValue) {
    err("form", `Order value exceeds your limit of ₹${t.limits.maxOrderValue.toLocaleString("en-IN")}`);
  }

  // The margin figure is an estimate (flat leverage), so a shortfall warns rather than blocks.
  if (t.availableMargin > 0 && t.marginRequired > t.availableMargin) {
    warn("form", "Estimated margin required is more than your available margin");
  }

  return issues;
}

export function needsConfirmation(t: Pick<TicketInput, "orderType" | "price" | "ltp" | "qty">): boolean {
  return isMarketType(t.orderType) || orderValue(t) >= CONFIRM_VALUE_THRESHOLD;
}

/** New random key; one per submit intent so a retry of the same intent reuses it. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
