# Pure Foodmart — Financial ERP & Cash Flow Management System

## Production-Grade System Design & Architectural Blueprint

**Document version:** 1.0
**Date:** 2026-07-18
**Status:** Engineering specification — ready for implementation
**Scope:** Financial control layer only. Order management, customer data, and courier dispatch remain in Nuport/WooCommerce/Steadfast.

---

## Table of Contents

1. [Executive Summary & Design Principles](#1-executive-summary--design-principles)
2. [System Context & Integration Architecture](#2-system-context--integration-architecture)
3. [Chart of Accounts (Bangladesh e-commerce context)](#3-chart-of-accounts)
4. [Double-Entry Journal Logic — Exact Debit/Credit Rules](#4-double-entry-journal-logic)
5. [BOM & Inventory Costing Engine](#5-bom--inventory-costing-engine)
6. [Courier Receivables & Settlement Reconciliation](#6-courier-receivables--settlement-reconciliation)
7. [Partner Equity, Capital & Drawings](#7-partner-equity-capital--drawings)
8. [Fixed Assets & Depreciation](#8-fixed-assets--depreciation)
9. [Database Schema — Full PostgreSQL DDL](#9-database-schema)
10. [Ledger Integrity Controls ("Not a single Taka unaccounted")](#10-ledger-integrity-controls)
11. [System Architecture & Tech Stack](#11-system-architecture--tech-stack)
12. [End-to-End Data Flow Map](#12-end-to-end-data-flow-map)
13. [Dashboard & Reporting Specification](#13-dashboard--reporting-specification)
14. [Failure Modes, Edge Cases & Recovery](#14-failure-modes-edge-cases--recovery)
15. [Security, Audit & Compliance](#15-security-audit--compliance)
16. [Implementation Roadmap](#16-implementation-roadmap)

---

## 1. Executive Summary & Design Principles

Pure Foodmart sells packaged food products (jaggery/gur, aamsotto, etc.) via WooCommerce, with order operations run in **Nuport** and last-mile delivery via **Steadfast**. This system is the **financial system of record** that sits *downstream* of Nuport. It never touches order fulfilment; it converts operational events into immutable accounting facts.

### 1.1 Non-negotiable design principles

| # | Principle | Enforcement mechanism |
|---|-----------|----------------------|
| P1 | **Every financial fact is a balanced journal entry.** No table stores a "balance" that is not derivable from journal lines. | Deferred DB constraint trigger: `SUM(debits) = SUM(credits)` per entry at COMMIT. |
| P2 | **Append-only ledger.** Journal entries are never updated or deleted. Corrections are reversing entries. | DB rules revoke `UPDATE`/`DELETE` on posted entries; period-lock table. |
| P3 | **Idempotent ingestion.** A Nuport webhook replayed 50 times produces exactly one set of journal entries. | Unique constraint on `(source_system, external_event_id)`; order-level financial state machine. |
| P4 | **Dual-path sync (webhook + cron) with reconciliation.** Webhooks are fast but lossy; the nightly cron is slow but complete. Cron diffs, never blindly re-inserts. | `sync_runs` + `nuport_events` dedup; discrepancy report. |
| P5 | **Inventory value and quantity move together.** Every stock movement carries a unit cost; COGS is computed from the same movement rows that decrement quantity. | Single `inventory_movements` table drives both; moving weighted-average cost maintained transactionally. |
| P6 | **Cash locations are first-class.** Cash-in-hand, Bank, bKash wallet, and each Courier Receivable are separate ledger accounts, reconciled independently. | Chart of accounts §3; settlement matching §6. |
| P7 | **Everything auditable.** Who/when/what for every mutation; hash-chained journal for tamper evidence. | `audit_log`, `entry_hash` chain §10. |

### 1.2 What this system is NOT

- Not an OMS: it never creates, edits, or ships orders.
- Not a customer CRM: it stores only the order references needed for reconciliation.
- Not a tax filing tool (though its trial balance feeds one).

---

## 2. System Context & Integration Architecture

### 2.1 Context diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            EXTERNAL SYSTEMS                                 │
│                                                                             │
│  ┌──────────────┐      ┌──────────────────┐      ┌─────────────────┐        │
│  │ WooCommerce  │─────▶│      NUPORT      │─────▶│    Steadfast    │        │
│  │  (storefront)│      │ (OMS: orders,    │      │    (courier)    │        │
│  └──────────────┘      │  customers,      │      └─────────────────┘        │
│                        │  SKUs, statuses) │                                 │
│                        └───────┬──────────┘                                 │
│                                │  Company ID + API Key                      │
│                    Webhooks    │    REST pulls (cron)                       │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 PURE FOODMART FINANCIAL ERP (this system)                   │
│                                                                             │
│  Ingestion Layer ─▶ Financial Event Processor ─▶ Double-Entry Ledger        │
│                          │                            │                     │
│                          ▼                            ▼                     │
│                   BOM/Inventory Engine         Reporting & Dashboard        │
│                                                                             │
│  Manual portals: Expenses │ Purchases │ Equity │ Fixed Assets │ Settlements │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Nuport integration contract

**Credentials.** `NUPORT_COMPANY_ID` and `NUPORT_API_KEY` are stored in the platform secret manager (never in code or DB). All calls send them per Nuport's auth scheme (header-based). A dedicated integration user in Nuport should be scoped read-only if Nuport supports scoping.

**Channel A — Webhooks (near-real-time).**

- Endpoint: `POST https://erp.purefoodmart.com/api/v1/webhooks/nuport`
- Security: (a) HMAC signature verification if Nuport signs payloads; otherwise (b) a long random secret embedded in the webhook URL path + IP allow-listing, and (c) **trust-but-verify**: every webhook-received order is re-fetched from the Nuport REST API by ID before any financial posting. The webhook is a *trigger*, never the *source of truth* — this neutralizes spoofed payloads entirely.
- Subscribed events (map to Nuport's actual event names during implementation):
  - `order.status_changed` → interesting transitions: `delivered`, `returned`, `partially_delivered`, `cancelled`
  - `order.updated` (amount/discount edits before delivery)
- Handling: the HTTP handler does **only** this — validate auth, insert raw payload into `nuport_events`, enqueue job, return `200` in <200 ms. All processing is async (queue worker). This makes webhook delivery reliable even during deploys/DB migrations.

**Channel B — Cron pull (completeness guarantee).**

- Schedule: daily at 02:30 Asia/Dhaka (low traffic), plus an hourly light "recent changes" pull (`updated_since = last successful cursor`).
- Pulls: paginated order list with statuses + line items (SKU, qty, unit price, discounts, COD amount, payment method), and the SKU master list (for new-SKU detection).
- Behavior: for each pulled order, compute a **canonical financial fingerprint** (hash of status + totals + lines). If the fingerprint matches what we already processed → skip. If new/different → enqueue the same processing job the webhook path uses. **One processing pipeline, two triggers.**
- Cursor stored in `sync_runs`; a failed run never advances the cursor.

**Rate/retry policy.** Exponential backoff (2s/4s/8s/16s, max 5 tries) on 429/5xx; circuit breaker opens after 10 consecutive failures and alerts ops; cron job is resumable mid-pagination via stored page cursor.

### 2.3 Order financial state machine

Nuport owns *operational* status; the ERP owns *financial* status. Financial postings key off financial-state transitions, which are derived from operational status but gated by idempotency:

```
                    ┌──────────────────────────────────────────────┐
                    ▼                                              │
 (new order seen) SYNCED ──delivered──▶ REVENUE_POSTED ──settled──▶ SETTLED
                    │                        │
                    │ cancelled/RTO          │ returned-after-delivery
                    ▼                        ▼
                 CLOSED_NO_REVENUE      RETURN_POSTED ──refund/settle──▶ SETTLED
```

Rules:

- Revenue + COGS post **exactly once**, on the first observation of `delivered` (webhook or cron, whichever arrives first).
- A later duplicate `delivered` event is a no-op (state already `REVENUE_POSTED`).
- `partially_delivered` posts revenue/COGS only for the delivered lines (Nuport line-level delivered quantities; if Nuport reports only order-level partials, treat as full-deliver + subsequent return adjustment — decide during API discovery).
- A status *regression* reported by Nuport (delivered → returned) triggers reversing entries, never edits.

---

## 3. Chart of Accounts

Numbering follows a conventional 4-digit scheme. `normal_balance` determines sign convention. All amounts in **BDT (Taka)**, stored as `NUMERIC(14,2)`.

### 3.1 Assets (1xxx) — normal balance: DEBIT

| Code | Account | Notes |
|------|---------|-------|
| 1010 | Cash in Hand | Physical drawer/office cash |
| 1020 | Bank — [Bank Name] Current A/C | One account per real bank account |
| 1030 | bKash Merchant Wallet | Mobile-money balance |
| 1040 | Nagad Wallet | If used |
| 1110 | Courier Receivable — Steadfast | COD collected by courier, not yet remitted |
| 1120 | Courier Receivable — [Other courier] | One account per courier |
| 1210 | Accounts Receivable — Other | Wholesale/credit customers, if any |
| 1310 | Inventory — Raw Materials | Bulk jaggery, aamsotto pulp, etc. |
| 1320 | Inventory — Packaging Materials | 2KG/3KG/5KG cartons, labels, tape |
| 1330 | Inventory — Finished Goods | Only if pre-packing to stock (see §5.6) |
| 1340 | Inventory — Goods in Transit | Optional: shipped-not-delivered value |
| 1410 | Advances & Prepayments | Supplier advances, prepaid rent |
| 1510 | Fixed Assets — Machinery & Equipment | At cost |
| 1520 | Fixed Assets — Computers & Electronics | At cost |
| 1530 | Fixed Assets — Furniture & Fixtures | At cost |
| 1590 | Accumulated Depreciation (contra) | Normal balance CREDIT; contra-asset |

### 3.2 Liabilities (2xxx) — normal balance: CREDIT

| Code | Account | Notes |
|------|---------|-------|
| 2010 | Accounts Payable — Suppliers | Credit purchases of raw/packaging |
| 2110 | Customer Advances (Unearned Revenue) | Prepaid (bKash-before-delivery) orders not yet delivered |
| 2210 | Accrued Expenses | Unpaid electricity/labor at month end |
| 2310 | Loans Payable | If any |

### 3.3 Equity (3xxx) — normal balance: CREDIT

| Code | Account | Notes |
|------|---------|-------|
| 3010 | Partner Capital — [Partner A] | One per partner |
| 3011 | Partner Capital — [Partner B] | |
| 3110 | Partner Drawings — [Partner A] | Normal balance DEBIT; contra-equity, closed to capital annually |
| 3111 | Partner Drawings — [Partner B] | |
| 3910 | Retained Earnings | Closing target for P&L |
| 3990 | Current Year Earnings | System-computed, not posted to directly |

### 3.4 Income (4xxx) — normal balance: CREDIT

| Code | Account | Notes |
|------|---------|-------|
| 4010 | Sales Revenue — Products | Product price net of product discounts |
| 4020 | Delivery Charge Income | Delivery fee charged to customer |
| 4110 | Sales Returns & Allowances (contra) | Normal balance DEBIT |
| 4210 | Other Income | |
| 4910 | Gain on Asset Disposal | |

### 3.5 Expenses (5xxx–6xxx) — normal balance: DEBIT

| Code | Account | Notes |
|------|---------|-------|
| 5010 | COGS — Raw Materials | Auto-posted by BOM engine |
| 5020 | COGS — Packaging | Auto-posted by BOM engine |
| 5090 | Inventory Shrinkage/Adjustment | Count variances, spoilage |
| 6010 | Courier & Delivery Charges | Steadfast fees, RTO charges |
| 6020 | Marketing — Facebook Ads/Boosting | |
| 6030 | Payment Gateway Charges | bKash/gateway fees |
| 6110 | Salaries & Labor | |
| 6120 | Electricity & Utilities | |
| 6130 | Rent | |
| 6140 | Office & Miscellaneous | |
| 6210 | Depreciation Expense | Auto-posted monthly |
| 6910 | Loss on Asset Disposal | |

---

## 4. Double-Entry Journal Logic

Every event below produces one atomic `journal_entry` with ≥2 `journal_lines`. Amounts are illustrative. **Dr = Debit, Cr = Credit.**

### 4.1 Sales lifecycle (COD via Steadfast — the dominant flow)

**Worked example:** Order NP-10234 — one "5KG Jaggery Pack" @ ৳1,050 + ৳100 delivery charge = COD amount ৳1,150. BOM cost of the pack: ৳612 (5 kg raw jaggery @ ৳118/kg = ৳590 + one 5KG carton @ ৳22).

**E1. Order synced but not delivered** → *no journal entry.* (No financial event has occurred. The order sits in `sales_orders` at state `SYNCED`. Optional: goods-in-transit posting if pre-shipping deduction is enabled, §5.6.)

**E2. Nuport reports `delivered` (revenue recognition point):**

```
JE-A  Revenue recognition (source: nuport_event #...)
  Dr 1110 Courier Receivable — Steadfast     1,150.00
      Cr 4010 Sales Revenue — Products                  1,050.00
      Cr 4020 Delivery Charge Income                      100.00

JE-B  COGS via BOM deduction (same DB transaction as JE-A)
  Dr 5010 COGS — Raw Materials                 590.00
  Dr 5020 COGS — Packaging                      22.00
      Cr 1310 Inventory — Raw Materials                   590.00
      Cr 1320 Inventory — Packaging Materials              22.00
```

> JE-A and JE-B are posted inside **one DB transaction** together with the inventory movement rows, so revenue, COGS, and stock can never diverge.

**E3. Steadfast settles (weekly payout, deducts its fee).** Gross COD collected across the period ৳46,000; courier charges ৳3,120; net bank credit ৳42,880:

```
JE-C  Courier settlement #ST-2026-07-W2
  Dr 1020 Bank                              42,880.00
  Dr 6010 Courier & Delivery Charges         3,120.00
      Cr 1110 Courier Receivable — Steadfast           46,000.00
```

The settlement is **matched order-by-order** (§6): the ৳46,000 must equal the sum of COD amounts of the specific orders listed on the Steadfast statement, and each matched order's financial state advances to `SETTLED`.

**E4. RTO — returned before delivery (courier failed to deliver).** No revenue was ever posted (state was `SYNCED`). Costs: courier return charge ৳70, payable/offset against future settlement:

```
JE-D  RTO charge, order NP-10250
  Dr 6010 Courier & Delivery Charges            70.00
      Cr 1110 Courier Receivable — Steadfast                70.00
      (Steadfast nets return charges out of the next payout)
```

If goods return to warehouse sellable → restock movement (no value change if FG never left inventory-valuation-wise; see §5.6 for the shipped-deduction variant). If damaged: `Dr 5090 Shrinkage / Cr 1310-1320` at component cost.

**E5. Return after delivery (customer returns, refund via courier/bKash).** Reverse revenue via contra account (preserves gross-sales reporting), reverse COGS if restockable:

```
JE-E  Post-delivery return, order NP-10234
  Dr 4110 Sales Returns & Allowances         1,050.00
  Dr 4020 Delivery Charge Income               100.00      (or leave if fee non-refundable)
      Cr 1110 Courier Receivable — Steadfast             1,150.00   (if before settlement)
      — or —  Cr 1030 bKash Wallet                       1,150.00   (if refunded after settlement)

JE-F  Restock (goods sellable)
  Dr 1310 Inventory — Raw Materials            590.00
  Dr 1320 Inventory — Packaging                 22.00
      Cr 5010 COGS — Raw Materials                        590.00
      Cr 5020 COGS — Packaging                             22.00
```

### 4.2 Prepaid orders (bKash/bank paid before delivery)

Rigorous treatment — money received ≠ revenue earned:

```
JE-G  Payment received (webhook: order paid / cron)
  Dr 1030 bKash Merchant Wallet              1,128.00     (net of gateway fee ৳22)
  Dr 6030 Payment Gateway Charges               22.00
      Cr 2110 Customer Advances                          1,150.00

JE-H  On `delivered`
  Dr 2110 Customer Advances                  1,150.00
      Cr 4010 Sales Revenue — Products                  1,050.00
      Cr 4020 Delivery Charge Income                      100.00
  (+ COGS entry JE-B as usual)
```

If a prepaid order is cancelled → `Dr 2110 / Cr 1030` on refund. The 2110 balance is always the exact Taka value of undelivered prepaid orders — a built-in control.

### 4.3 Purchases (manual entry portal)

**Bulk raw material — 200 kg jaggery @ ৳118/kg, paid by bank:**

```
JE-I
  Dr 1310 Inventory — Raw Materials         23,600.00
      Cr 1020 Bank                                      23,600.00
```

**Packaging — 500 × 5KG cartons @ ৳22, on supplier credit:**

```
JE-J
  Dr 1320 Inventory — Packaging             11,000.00
      Cr 2010 Accounts Payable                          11,000.00
JE-K  (on payment)
  Dr 2010 Accounts Payable                  11,000.00
      Cr 1010 Cash in Hand                              11,000.00
```

Each purchase simultaneously writes an `inventory_movements` row (+qty, unit cost), which updates the moving average (§5.3).

### 4.4 Operating expenses (manual portal)

```
Facebook boosting ৳2,500 paid from bKash:
  Dr 6020 Marketing — Facebook Ads           2,500.00
      Cr 1030 bKash Merchant Wallet                      2,500.00

Electricity ৳1,800 cash;  Labor ৳12,000 cash:
  Dr 6120 Electricity & Utilities            1,800.00
  Dr 6110 Salaries & Labor                  12,000.00
      Cr 1010 Cash in Hand                              13,800.00

Month-end accrual for unpaid labor:
  Dr 6110 Salaries & Labor                   4,000.00
      Cr 2210 Accrued Expenses                           4,000.00
```

### 4.5 Partner equity events

```
Capital injection — Partner A deposits ৳200,000 to bank:
  Dr 1020 Bank                             200,000.00
      Cr 3010 Partner Capital — A                      200,000.00

Drawing — Partner B takes ৳15,000 cash:
  Dr 3111 Partner Drawings — B              15,000.00
      Cr 1010 Cash in Hand                              15,000.00

Drawing in kind — Partner A takes product for personal use (BOM cost ৳612):
  Dr 3110 Partner Drawings — A                 612.00
      Cr 1310 Inventory — Raw Materials                   590.00
      Cr 1320 Inventory — Packaging                        22.00

Year-end close of drawings into capital:
  Dr 3010 Partner Capital — A               [total A drawings]
      Cr 3110 Partner Drawings — A                      [same]
```

### 4.6 Fixed assets

```
Purchase — packing machine ৳85,000 by bank:
  Dr 1510 Fixed Assets — Machinery          85,000.00
      Cr 1020 Bank                                      85,000.00

Monthly depreciation (auto, §8):
  Dr 6210 Depreciation Expense               1,239.58
      Cr 1590 Accumulated Depreciation                   1,239.58

Disposal — sold after 18 months for ৳65,000 cash; book value = 85,000 − 22,312.50 = 62,687.50:
  Dr 1010 Cash in Hand                      65,000.00
  Dr 1590 Accumulated Depreciation          22,312.50
      Cr 1510 Fixed Assets — Machinery                  85,000.00
      Cr 4910 Gain on Asset Disposal                     2,312.50
  (If sale price < book value, the balancing debit goes to 6910 Loss on Disposal.)
```

### 4.7 Posting-rule matrix (machine-readable summary)

| Event code | Trigger | Dr | Cr |
|---|---|---|---|
| `SALE_DELIVERED_COD` | Nuport `delivered`, COD | 1110 (COD amt) | 4010, 4020 |
| `SALE_DELIVERED_PREPAID` | Nuport `delivered`, prepaid | 2110 | 4010, 4020 |
| `PREPAYMENT_RECEIVED` | Payment event | 1030/1020, 6030 | 2110 |
| `COGS_BOM` | With any revenue posting | 5010, 5020 | 1310, 1320 |
| `COURIER_SETTLEMENT` | Manual/CSV settlement match | 1020, 6010 | 1110 |
| `RTO_CHARGE` | Nuport `returned` (pre-delivery) | 6010 | 1110 |
| `POST_DELIVERY_RETURN` | Nuport return event | 4110 (+4020) | 1110/1030/1010 |
| `RETURN_RESTOCK` | Return marked sellable | 1310, 1320 | 5010, 5020 |
| `PURCHASE_RAW` | Purchase portal | 1310 | 1010/1020/2010 |
| `PURCHASE_PACKAGING` | Purchase portal | 1320 | 1010/1020/2010 |
| `OPEX` | Expense portal | 6xxx | 1010/1020/1030 |
| `CAPITAL_IN` | Equity portal | 1010/1020 | 30xx |
| `DRAWING_CASH` | Equity portal | 31xx | 1010/1020 |
| `DRAWING_KIND` | Equity portal | 31xx | 1310/1320 |
| `FA_PURCHASE` | Asset registry | 15xx | 1010/1020 |
| `FA_DEPRECIATION` | Monthly cron | 6210 | 1590 |
| `FA_DISPOSAL` | Asset registry | cash +1590 (+6910) | 15xx (+4910) |
| `SHRINKAGE` | Stock count portal | 5090 | 1310/1320 |

These rules live in a `posting_rules` config table so account mappings are data, not code.

---

## 5. BOM & Inventory Costing Engine

### 5.1 Item taxonomy

- **`RAW`** — bulk food inputs tracked by weight (KG): raw jaggery, aamsotto sheet/pulp.
- **`PACKAGING`** — discrete units (PCS): "Carton 2KG", "Carton 3KG", "Carton 5KG", labels, tape.
- **`FINISHED`** — sellable SKUs mapped 1:1 to Nuport/WooCommerce SKUs: "Jaggery 2KG Pack", "Jaggery 5KG Pack", "Aamsotto 1KG Pack", combo SKUs.

### 5.2 BOM definition

Each FINISHED SKU has exactly one **active, versioned** BOM. Example:

```
SKU JAG-5KG  "5KG Jaggery Pack"   BOM v2 (active from 2026-06-01)
  ├─ RAW  RAW-JAG   Raw Jaggery       5.000 KG
  └─ PKG  CTN-5KG   Carton 5KG        1.000 PCS

SKU COMBO-JA  "Jaggery 2KG + Aamsotto 1KG Combo"   BOM v1
  ├─ RAW  RAW-JAG   Raw Jaggery       2.000 KG
  ├─ RAW  RAW-AAM   Aamsotto          1.000 KG
  ├─ PKG  CTN-2KG   Carton 2KG        1.000 PCS
  └─ PKG  CTN-1KG   Carton 1KG        1.000 PCS
```

BOMs are **versioned** (`valid_from`/`valid_to`): editing a recipe creates a new version; historical COGS postings keep pointing at the version that was active at delivery time, so past P&L never silently changes.

### 5.3 Costing method: Moving Weighted Average (MWA)

Chosen over FIFO for food commodities with fluctuating purchase prices: simpler, order-independent, and standard for perpetual systems.

Maintained per item, updated only by **inbound** movements:

```
new_avg_cost = (on_hand_qty × avg_cost + in_qty × in_unit_cost) / (on_hand_qty + in_qty)
```

Outbound movements (BOM deduction, shrinkage, drawing-in-kind) consume at current `avg_cost` and **do not change** it. The update is executed with `SELECT … FOR UPDATE` on the item's stock row to serialize concurrent movements.

### 5.4 Sale-to-COGS algorithm (the core loop)

Executed inside the same DB transaction as revenue posting (JE-A):

```
INPUT: delivered order O with lines [(sku, qty_sold), ...]

1. For each line:
     bom = active BOM version for sku at O.delivered_at
     if bom is missing → HALT order in state NEEDS_BOM (see §14.3); post revenue
                          entry only, flag order in exceptions dashboard
2. Explode: requirements = Σ over lines of (component_item, qty_sold × bom_qty)
   (merging duplicate components across lines — e.g., combo + single jaggery
    orders both consume RAW-JAG; a single merged movement per component)
3. For each (item, req_qty), in item_id order (deadlock avoidance):
     lock item_stock row FOR UPDATE
     unit_cost = item_stock.avg_cost
     insert inventory_movements(item, -req_qty, unit_cost, type='SALE_BOM', ref=O)
     item_stock.on_hand -= req_qty        (may go negative → exception flag, §14.4)
     line_value = round(req_qty × unit_cost, 2)
4. cogs_raw  = Σ line_value where item.kind = RAW
   cogs_pkg  = Σ line_value where item.kind = PACKAGING
5. Post JE-B: Dr 5010 cogs_raw, Dr 5020 cogs_pkg /
              Cr 1310 cogs_raw, Cr 1320 cogs_pkg
6. Store per-order COGS snapshot on sales_orders for instant per-order margin.
```

Multi-product orders are inherently handled: step 2 merges the explosion across all lines before any movement is written.

### 5.5 Rounding discipline

- Quantities: `NUMERIC(12,3)` (grams precision on KG items).
- Money: `NUMERIC(14,2)`; each movement's value rounded to 2 dp at the movement level; JE lines sum movement values exactly → ledger and inventory subledger always agree to the poisha.
- `avg_cost` stored at `NUMERIC(14,6)` to prevent drift, rounded only at valuation/posting time.

### 5.6 Deduction timing policy (explicit decision)

**Default (recommended): deduct at `delivered`.** Matches revenue recognition exactly (COGS and revenue in the same entry/period); RTO orders never touch inventory value.
Trade-off: between "shipped" and "delivered/returned", physical stock is lower than book stock.

**Optional mode B: deduct at `shipped` into 1340 Goods in Transit** (`Dr 1340 / Cr 1310+1320` on ship; on delivery `Dr 5010/5020 / Cr 1340`; on RTO `Dr 1310/1320 / Cr 1340`). Airtight for stock counts but doubles entry volume. Ship Mode A first; Mode B is a config flag (`inventory.deduction_point`), and the schema (movement types `SHIP_OUT`, `TRANSIT_TO_COGS`, `TRANSIT_RESTOCK`) already supports it.

### 5.7 Stock counts

Monthly physical count portal: enter counted qty per item → system computes variance vs book → one adjustment movement + `Dr/Cr 5090 Shrinkage` entry per item. Variance report is a permanent record (`stock_counts`, `stock_count_lines`).

---

## 6. Courier Receivables & Settlement Reconciliation

This is where e-commerce businesses leak money. Design:

1. **Per-order receivable tracking.** Account 1110's balance always equals `Σ cod_amount` of orders in state `REVENUE_POSTED` (delivered, unsettled) minus pending RTO charge offsets. The dashboard shows this both as a ledger balance and as a drill-down list of the exact unsettled orders — the two views come from the same rows and must always match.
2. **Settlement ingestion.** Steadfast payout statements (CSV/portal export, or Steadfast API if enabled) are uploaded to the Settlement portal. Each statement row = (consignment/invoice ID, order ref, COD collected, courier charge, net).
3. **Auto-matching.** Rows match to `sales_orders` by Nuport order ref / consignment ID. Match outcomes:
   - **Matched exact** → order → `SETTLED`; contributes to JE-C amounts.
   - **Amount mismatch** (courier collected ≠ our COD amount) → exception queue; must be resolved (partial collection, courier discount, data error) before the settlement posts.
   - **Unknown order** in statement, or **order we expected missing** from statement → exception queue.
4. **One JE-C per settlement batch**, whose receivable credit equals the sum of matched orders exactly. The settlement cannot be posted while unresolved exceptions exist. `Dr Bank` must equal the actual bank credit (user confirms against bank statement) — any residual difference must be explicitly classified (courier charge, adjustment) before posting is allowed. **The system refuses to post unbalanced or unexplained settlements.**
5. **Aging report.** Courier receivable aging (0–7, 8–14, 15–30, >30 days since delivery). >14 days unsettled = alert. This surfaces "money stuck with couriers" automatically.

---

## 7. Partner Equity, Capital & Drawings

- `partners` registry with agreed **profit-sharing percentages** (versioned: `partner_share_versions` with `valid_from`, shares must sum to 100.000%).
- Every equity movement is a journal entry (§4.5) *plus* a typed row in `equity_transactions` (kind: `CAPITAL_IN`, `DRAWING_CASH`, `DRAWING_KIND`, `PROFIT_ALLOCATION`, `DRAWINGS_CLOSE`) for clean per-partner statements.
- **Partner statement report:** opening capital → + injections → + profit allocation (current-year earnings × share %) → − drawings → closing capital. Profit allocation is posted at year-close: `Dr 3990/Retained Earnings → Cr 3010/3011` per share percentages.
- Drawings are visible in real time; the dashboard shows each partner's net position, so "personal cash withdrawals vs capital re-introduction" is never ambiguous.

---

## 8. Fixed Assets & Depreciation

- Registry fields: asset code, name, category (→ maps to 15xx account), acquisition date, cost, salvage value, useful life (months), method (`STRAIGHT_LINE` | `DIMINISHING`), diminishing rate, status (`ACTIVE`/`DISPOSED`/`WRITTEN_OFF`).
- **Monthly depreciation cron** (1st of month, 03:00 Dhaka) posts one aggregate JE (`Dr 6210 / Cr 1590`) with per-asset breakdown rows in `depreciation_entries`:
  - Straight-line monthly: `(cost − salvage) / life_months`
  - Diminishing monthly: `book_value_start_of_month × (annual_rate / 12)`
  - First month prorated by acquisition day; depreciation stops when book value = salvage.
  - Idempotent: unique `(asset_id, period)` — a re-run cannot double-post.
- **Disposal:** user enters sale price + settlement account; system computes book value = cost − accumulated depreciation *(including a final partial-month charge up to disposal date)*, derives gain/loss automatically, posts the composite entry (§4.6), and freezes the asset.

---

## 9. Database Schema

PostgreSQL ≥ 15. Full DDL — primary keys, foreign keys, constraints, and the ledger-integrity triggers.

```sql
-- ============================================================
-- 0. ENUMS
-- ============================================================
CREATE TYPE account_type      AS ENUM ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE');
CREATE TYPE normal_side       AS ENUM ('DEBIT','CREDIT');
CREATE TYPE item_kind         AS ENUM ('RAW','PACKAGING','FINISHED');
CREATE TYPE movement_type     AS ENUM ('PURCHASE','SALE_BOM','RETURN_RESTOCK','ADJUSTMENT',
                                       'DRAWING_KIND','SHIP_OUT','TRANSIT_TO_COGS','TRANSIT_RESTOCK');
CREATE TYPE order_fin_state   AS ENUM ('SYNCED','REVENUE_POSTED','RETURN_POSTED',
                                       'CLOSED_NO_REVENUE','SETTLED','NEEDS_BOM','EXCEPTION');
CREATE TYPE payment_mode      AS ENUM ('COD','BKASH','NAGAD','BANK','CARD','OTHER');
CREATE TYPE source_type       AS ENUM ('NUPORT_ORDER','SETTLEMENT','PURCHASE','EXPENSE',
                                       'EQUITY','FIXED_ASSET','DEPRECIATION','STOCK_COUNT',
                                       'MANUAL_JOURNAL','CLOSING');
CREATE TYPE equity_kind       AS ENUM ('CAPITAL_IN','DRAWING_CASH','DRAWING_KIND',
                                       'PROFIT_ALLOCATION','DRAWINGS_CLOSE');
CREATE TYPE depr_method       AS ENUM ('STRAIGHT_LINE','DIMINISHING');
CREATE TYPE sync_channel      AS ENUM ('WEBHOOK','CRON');
CREATE TYPE event_status      AS ENUM ('RECEIVED','QUEUED','PROCESSED','SKIPPED_DUPLICATE','FAILED');

-- ============================================================
-- 1. CHART OF ACCOUNTS & LEDGER CORE
-- ============================================================
CREATE TABLE accounts (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(8)  NOT NULL UNIQUE,
  name            VARCHAR(120) NOT NULL,
  type            account_type NOT NULL,
  normal_balance  normal_side  NOT NULL,
  parent_id       INT REFERENCES accounts(id),
  is_cash_location BOOLEAN NOT NULL DEFAULT FALSE,   -- 1010/1020/1030/1040
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fiscal_periods (
  id          SERIAL PRIMARY KEY,
  period      CHAR(7) NOT NULL UNIQUE,          -- 'YYYY-MM'
  starts_on   DATE NOT NULL,
  ends_on     DATE NOT NULL,
  is_locked   BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at   TIMESTAMPTZ,
  locked_by   INT                                -- REFERENCES users(id), added below
);

CREATE TABLE journal_entries (
  id              BIGSERIAL PRIMARY KEY,
  entry_no        BIGINT NOT NULL UNIQUE,        -- gapless sequence via counter table
  entry_date      DATE NOT NULL,
  period          CHAR(7) NOT NULL,              -- denormalized, FK below
  memo            TEXT NOT NULL,
  source_type     source_type NOT NULL,
  source_id       BIGINT,                        -- FK to originating business row
  event_code      VARCHAR(40) NOT NULL,          -- posting-rule matrix code (§4.7)
  reversal_of     BIGINT REFERENCES journal_entries(id),
  posted_by       INT,                           -- user id or NULL = system
  posted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_hash      CHAR(64) NOT NULL,             -- SHA-256 chain (§10.3)
  prev_hash       CHAR(64) NOT NULL,
  CONSTRAINT fk_period FOREIGN KEY (period) REFERENCES fiscal_periods(period)
);
CREATE INDEX idx_je_source ON journal_entries(source_type, source_id);
CREATE INDEX idx_je_date   ON journal_entries(entry_date);

CREATE TABLE journal_lines (
  id          BIGSERIAL PRIMARY KEY,
  entry_id    BIGINT NOT NULL REFERENCES journal_entries(id),
  line_no     SMALLINT NOT NULL,
  account_id  INT NOT NULL REFERENCES accounts(id),
  debit       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description TEXT,
  UNIQUE (entry_id, line_no),
  CONSTRAINT one_side_only CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);
CREATE INDEX idx_jl_account ON journal_lines(account_id, entry_id);

-- ---- Integrity trigger 1: every entry balances (checked at COMMIT) ----
CREATE OR REPLACE FUNCTION assert_entry_balanced() RETURNS TRIGGER AS $$
DECLARE d NUMERIC(14,2); c NUMERIC(14,2); n INT;
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*)
    INTO d, c, n FROM journal_lines WHERE entry_id = NEW.id;
  IF n < 2 OR d <> c OR d = 0 THEN
    RAISE EXCEPTION 'Journal entry % unbalanced: debits=% credits=% lines=%',
                    NEW.id, d, c, n;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_entry_balanced
  AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_entry_balanced();

-- ---- Integrity trigger 2: append-only ledger ----
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger is append-only; post a reversing entry instead';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_je_immutable  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
CREATE TRIGGER trg_jl_immutable  BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

-- ---- Integrity trigger 3: no posting into locked periods ----
CREATE OR REPLACE FUNCTION assert_period_open() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM fiscal_periods
             WHERE period = NEW.period AND is_locked) THEN
    RAISE EXCEPTION 'Period % is locked', NEW.period;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_period_open BEFORE INSERT ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION assert_period_open();

CREATE TABLE posting_rules (
  event_code   VARCHAR(40) PRIMARY KEY,
  description  TEXT NOT NULL,
  rule_json    JSONB NOT NULL      -- declarative Dr/Cr account mapping
);

-- ============================================================
-- 2. ITEMS, BOM, INVENTORY
-- ============================================================
CREATE TABLE items (
  id          SERIAL PRIMARY KEY,
  sku         VARCHAR(64) NOT NULL UNIQUE,      -- FINISHED skus == Nuport SKU codes
  name        VARCHAR(160) NOT NULL,
  kind        item_kind NOT NULL,
  uom         VARCHAR(8) NOT NULL,              -- 'KG' | 'PCS'
  inventory_account_id INT REFERENCES accounts(id),  -- 1310 / 1320 (RAW/PACKAGING only)
  cogs_account_id      INT REFERENCES accounts(id),  -- 5010 / 5020
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_component_accounts CHECK (
    kind = 'FINISHED' OR
    (inventory_account_id IS NOT NULL AND cogs_account_id IS NOT NULL)
  )
);

CREATE TABLE boms (
  id           SERIAL PRIMARY KEY,
  finished_item_id INT NOT NULL REFERENCES items(id),
  version      INT NOT NULL,
  valid_from   DATE NOT NULL,
  valid_to     DATE,                             -- NULL = current
  created_by   INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (finished_item_id, version)
);
-- at most one open (valid_to IS NULL) version per finished item:
CREATE UNIQUE INDEX uq_bom_open ON boms(finished_item_id) WHERE valid_to IS NULL;

CREATE TABLE bom_lines (
  id            SERIAL PRIMARY KEY,
  bom_id        INT NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  component_item_id INT NOT NULL REFERENCES items(id),
  qty_per_unit  NUMERIC(12,3) NOT NULL CHECK (qty_per_unit > 0),
  UNIQUE (bom_id, component_item_id)
);

CREATE TABLE item_stock (              -- one row per RAW/PACKAGING item (cache, rebuildable)
  item_id     INT PRIMARY KEY REFERENCES items(id),
  on_hand     NUMERIC(12,3) NOT NULL DEFAULT 0,
  avg_cost    NUMERIC(14,6) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_movements (     -- the inventory subledger (append-only)
  id           BIGSERIAL PRIMARY KEY,
  item_id      INT NOT NULL REFERENCES items(id),
  movement_type movement_type NOT NULL,
  qty          NUMERIC(12,3) NOT NULL CHECK (qty <> 0),   -- + in, − out
  unit_cost    NUMERIC(14,6) NOT NULL CHECK (unit_cost >= 0),
  value        NUMERIC(14,2) NOT NULL,                    -- round(qty*unit_cost,2), signed
  source_type  source_type NOT NULL,
  source_id    BIGINT NOT NULL,
  journal_entry_id BIGINT REFERENCES journal_entries(id),
  moved_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mov_item ON inventory_movements(item_id, moved_at);
CREATE INDEX idx_mov_src  ON inventory_movements(source_type, source_id);

CREATE TABLE stock_counts (
  id          SERIAL PRIMARY KEY,
  counted_on  DATE NOT NULL,
  counted_by  INT,
  posted_entry_id BIGINT REFERENCES journal_entries(id),
  notes       TEXT
);
CREATE TABLE stock_count_lines (
  id           SERIAL PRIMARY KEY,
  stock_count_id INT NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  item_id      INT NOT NULL REFERENCES items(id),
  book_qty     NUMERIC(12,3) NOT NULL,
  counted_qty  NUMERIC(12,3) NOT NULL,
  UNIQUE (stock_count_id, item_id)
);

-- ============================================================
-- 3. NUPORT SYNC & SALES
-- ============================================================
CREATE TABLE sync_runs (
  id            BIGSERIAL PRIMARY KEY,
  channel       sync_channel NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  cursor_before TEXT,
  cursor_after  TEXT,
  orders_seen   INT NOT NULL DEFAULT 0,
  orders_changed INT NOT NULL DEFAULT 0,
  status        VARCHAR(16) NOT NULL DEFAULT 'RUNNING',   -- RUNNING/OK/FAILED
  error         TEXT
);

CREATE TABLE nuport_events (           -- raw, immutable ingestion log
  id             BIGSERIAL PRIMARY KEY,
  channel        sync_channel NOT NULL,
  external_event_id VARCHAR(128),               -- Nuport webhook event id if provided
  nuport_order_ref  VARCHAR(64) NOT NULL,
  payload        JSONB NOT NULL,
  payload_hash   CHAR(64) NOT NULL,             -- dedup for cron-detected changes
  status         event_status NOT NULL DEFAULT 'RECEIVED',
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at   TIMESTAMPTZ,
  error          TEXT,
  UNIQUE (external_event_id),
  UNIQUE (nuport_order_ref, payload_hash)       -- same state seen twice = duplicate
);

CREATE TABLE sales_orders (
  id               BIGSERIAL PRIMARY KEY,
  nuport_order_ref VARCHAR(64) NOT NULL UNIQUE,
  woo_order_ref    VARCHAR(64),
  consignment_id   VARCHAR(64),                 -- Steadfast tracking/consignment
  courier          VARCHAR(32) NOT NULL DEFAULT 'STEADFAST',
  payment_mode     payment_mode NOT NULL,
  product_amount   NUMERIC(14,2) NOT NULL CHECK (product_amount >= 0),
  delivery_charge  NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  cod_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  fin_state        order_fin_state NOT NULL DEFAULT 'SYNCED',
  ordered_at       TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  returned_at      TIMESTAMPTZ,
  settled_at       TIMESTAMPTZ,
  cogs_amount      NUMERIC(14,2),               -- snapshot after BOM posting
  revenue_entry_id BIGINT REFERENCES journal_entries(id),
  cogs_entry_id    BIGINT REFERENCES journal_entries(id),
  last_event_id    BIGINT REFERENCES nuport_events(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_so_state ON sales_orders(fin_state);
CREATE INDEX idx_so_consignment ON sales_orders(consignment_id);

CREATE TABLE sales_order_lines (
  id           BIGSERIAL PRIMARY KEY,
  order_id     BIGINT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  item_id      INT REFERENCES items(id),        -- NULL until SKU mapped (§14.2)
  nuport_sku   VARCHAR(64) NOT NULL,
  qty          NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  unit_price   NUMERIC(14,2) NOT NULL,
  line_total   NUMERIC(14,2) NOT NULL,
  bom_id       INT REFERENCES boms(id),         -- BOM version used for COGS
  line_cogs    NUMERIC(14,2)
);

-- ============================================================
-- 4. COURIER SETTLEMENTS
-- ============================================================
CREATE TABLE courier_settlements (
  id            BIGSERIAL PRIMARY KEY,
  courier       VARCHAR(32) NOT NULL,
  statement_ref VARCHAR(64) NOT NULL,
  statement_date DATE NOT NULL,
  gross_cod     NUMERIC(14,2) NOT NULL,
  courier_charges NUMERIC(14,2) NOT NULL,
  net_paid      NUMERIC(14,2) NOT NULL,
  bank_account_id INT NOT NULL REFERENCES accounts(id),
  status        VARCHAR(16) NOT NULL DEFAULT 'DRAFT',  -- DRAFT/MATCHED/POSTED
  posted_entry_id BIGINT REFERENCES journal_entries(id),
  uploaded_by   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (courier, statement_ref),
  CONSTRAINT chk_settlement_math CHECK (net_paid = gross_cod - courier_charges)
);

CREATE TABLE settlement_lines (
  id             BIGSERIAL PRIMARY KEY,
  settlement_id  BIGINT NOT NULL REFERENCES courier_settlements(id) ON DELETE CASCADE,
  raw_order_ref  VARCHAR(64) NOT NULL,          -- as printed on courier statement
  order_id       BIGINT REFERENCES sales_orders(id),
  cod_collected  NUMERIC(14,2) NOT NULL,
  courier_charge NUMERIC(14,2) NOT NULL DEFAULT 0,
  match_status   VARCHAR(16) NOT NULL DEFAULT 'UNMATCHED',
                 -- UNMATCHED/MATCHED/AMOUNT_MISMATCH/UNKNOWN_ORDER/RESOLVED
  resolution_note TEXT,
  UNIQUE (settlement_id, raw_order_ref)
);
-- an order can appear in at most one posted settlement:
CREATE UNIQUE INDEX uq_settled_once ON settlement_lines(order_id)
  WHERE order_id IS NOT NULL AND match_status IN ('MATCHED','RESOLVED');

-- ============================================================
-- 5. PURCHASES & EXPENSES
-- ============================================================
CREATE TABLE suppliers (
  id       SERIAL PRIMARY KEY,
  name     VARCHAR(120) NOT NULL,
  phone    VARCHAR(32),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE purchases (
  id           BIGSERIAL PRIMARY KEY,
  supplier_id  INT REFERENCES suppliers(id),
  purchased_on DATE NOT NULL,
  invoice_ref  VARCHAR(64),
  paid_from_account_id INT REFERENCES accounts(id),   -- NULL = on credit (AP)
  total_amount NUMERIC(14,2) NOT NULL,
  posted_entry_id BIGINT REFERENCES journal_entries(id),
  entered_by   INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_lines (
  id          BIGSERIAL PRIMARY KEY,
  purchase_id BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  item_id     INT NOT NULL REFERENCES items(id),
  qty         NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  unit_cost   NUMERIC(14,6) NOT NULL CHECK (unit_cost >= 0),
  line_total  NUMERIC(14,2) NOT NULL
);

CREATE TABLE expenses (
  id           BIGSERIAL PRIMARY KEY,
  expense_date DATE NOT NULL,
  expense_account_id INT NOT NULL REFERENCES accounts(id),
  paid_from_account_id INT NOT NULL REFERENCES accounts(id),
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description  TEXT NOT NULL,
  receipt_url  TEXT,                              -- uploaded photo of receipt
  posted_entry_id BIGINT REFERENCES journal_entries(id),
  entered_by   INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. EQUITY
-- ============================================================
CREATE TABLE partners (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(120) NOT NULL,
  capital_account_id  INT NOT NULL REFERENCES accounts(id),
  drawings_account_id INT NOT NULL REFERENCES accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE partner_share_versions (
  id         SERIAL PRIMARY KEY,
  partner_id INT NOT NULL REFERENCES partners(id),
  share_pct  NUMERIC(6,3) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  valid_from DATE NOT NULL,
  valid_to   DATE
);

CREATE TABLE equity_transactions (
  id          BIGSERIAL PRIMARY KEY,
  partner_id  INT NOT NULL REFERENCES partners(id),
  kind        equity_kind NOT NULL,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  tx_date     DATE NOT NULL,
  counter_account_id INT REFERENCES accounts(id),  -- cash/bank/inventory source
  posted_entry_id BIGINT REFERENCES journal_entries(id),
  notes       TEXT,
  entered_by  INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. FIXED ASSETS
-- ============================================================
CREATE TABLE fixed_assets (
  id            SERIAL PRIMARY KEY,
  asset_code    VARCHAR(32) NOT NULL UNIQUE,
  name          VARCHAR(160) NOT NULL,
  asset_account_id INT NOT NULL REFERENCES accounts(id),   -- 15xx
  acquired_on   DATE NOT NULL,
  cost          NUMERIC(14,2) NOT NULL CHECK (cost > 0),
  salvage_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  life_months   INT CHECK (life_months > 0),
  method        depr_method NOT NULL,
  diminishing_annual_rate NUMERIC(6,4),          -- required if method=DIMINISHING
  status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  purchase_entry_id BIGINT REFERENCES journal_entries(id),
  CONSTRAINT chk_method_params CHECK (
    (method = 'STRAIGHT_LINE' AND life_months IS NOT NULL) OR
    (method = 'DIMINISHING'  AND diminishing_annual_rate IS NOT NULL)
  ),
  CONSTRAINT chk_salvage CHECK (salvage_value < cost)
);

CREATE TABLE depreciation_entries (
  id        BIGSERIAL PRIMARY KEY,
  asset_id  INT NOT NULL REFERENCES fixed_assets(id),
  period    CHAR(7) NOT NULL REFERENCES fiscal_periods(period),
  amount    NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  book_value_after NUMERIC(14,2) NOT NULL,
  posted_entry_id BIGINT REFERENCES journal_entries(id),
  UNIQUE (asset_id, period)                      -- idempotency guarantee
);

CREATE TABLE asset_disposals (
  id          BIGSERIAL PRIMARY KEY,
  asset_id    INT NOT NULL UNIQUE REFERENCES fixed_assets(id),
  disposed_on DATE NOT NULL,
  sale_price  NUMERIC(14,2) NOT NULL CHECK (sale_price >= 0),
  proceeds_account_id INT NOT NULL REFERENCES accounts(id),
  book_value  NUMERIC(14,2) NOT NULL,
  gain_loss   NUMERIC(14,2) NOT NULL,            -- + gain / − loss (computed)
  posted_entry_id BIGINT REFERENCES journal_entries(id),
  entered_by  INT
);

-- ============================================================
-- 8. USERS, RBAC, AUDIT
-- ============================================================
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(160) NOT NULL UNIQUE,
  full_name     VARCHAR(120) NOT NULL,
  password_hash TEXT NOT NULL,                   -- argon2id
  role          VARCHAR(24) NOT NULL,            -- OWNER/ACCOUNTANT/OPERATOR/VIEWER
  totp_secret   TEXT,                            -- 2FA
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id),          -- NULL = system job
  action      VARCHAR(64) NOT NULL,
  entity      VARCHAR(64) NOT NULL,
  entity_id   BIGINT,
  before_json JSONB,
  after_json  JSONB,
  ip_address  INET,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- deferred FKs declared earlier
ALTER TABLE fiscal_periods ADD CONSTRAINT fk_locked_by
  FOREIGN KEY (locked_by) REFERENCES users(id);
```

**Schema notes**

- `entry_no` gapless sequencing uses a single-row counter table updated in the posting transaction (a plain `SEQUENCE` leaves gaps on rollback; gapless numbering is an audit nicety worth the tiny serialization cost at this volume).
- `item_stock` is a cache: `on_hand` and `avg_cost` are fully rebuildable by replaying `inventory_movements` — a nightly job re-derives them and alarms on any mismatch (defense in depth).
- Account balances are **never stored**; they are `SUM(debit) − SUM(credit)` over `journal_lines`, served from a materialized `account_balances` view refreshed transactionally (or an incremental balance cache with the same replay-verify guarantee).

---

## 10. Ledger Integrity Controls

The "not a single Taka unaccounted" requirement decomposes into six enforced invariants:

| # | Invariant | Check | Frequency |
|---|-----------|-------|-----------|
| I1 | Trial balance: Σ all debits = Σ all credits | SQL assertion | Continuous (per-entry trigger) + nightly full scan |
| I2 | `1110 Courier Receivable` = Σ `cod_amount` of orders in `REVENUE_POSTED` − pending RTO offsets | Reconciliation query | Nightly + on-dashboard |
| I3 | `1310+1320` ledger balances = Σ `inventory_movements.value` = Σ(`item_stock.on_hand × avg_cost`) ± rounding reserve | Three-way match | Nightly |
| I4 | `2110 Customer Advances` = Σ prepaid undelivered order amounts | Reconciliation query | Nightly |
| I5 | Every `sales_orders.revenue_entry_id` maps to exactly one Nuport order; Nuport delivered-order totals (cron pull) = Σ revenue posted per day | Cross-system diff report | Daily cron |
| I6 | Cash location balances (1010/1020/1030) match physical count / bank statement / bKash statement | Manual reconciliation portal with sign-off log | Daily (cash), weekly (bank/bKash) |

Any violated invariant creates a row in an `integrity_alerts` table, blocks period-close, and notifies the owner (email/Telegram).

### 10.3 Tamper evidence — hash chain

Each `journal_entries.entry_hash = SHA256(prev_hash ‖ entry_no ‖ entry_date ‖ canonical-JSON(lines))`, with `prev_hash` = previous entry's hash. A nightly verifier walks the chain; any historical edit made outside the application (e.g., direct DB manipulation) breaks the chain and raises an alert. Combined with the append-only triggers and restricted DB roles, the ledger is tamper-evident end to end.

### 10.4 Period close checklist (enforced workflow)

Month close requires, in order: (1) all `nuport_events` processed or resolved; (2) no open settlement exceptions older than the period; (3) stock count posted or explicitly waived; (4) depreciation posted; (5) invariants I1–I5 green; (6) bank/bKash/cash reconciliations signed off → then `fiscal_periods.is_locked = true`. Locked periods reject postings at the DB level (trigger above); corrections go to the current open period as reversals.

---

## 11. System Architecture & Tech Stack

### 11.1 Recommended stack (pragmatic for a small team, scalable to ~10⁵ orders/month)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Database | **PostgreSQL 16** (managed: Neon / Supabase / AWS RDS) | Constraint triggers, `NUMERIC` money math, PITR backups. The ledger *is* the product — Postgres is non-negotiable. |
| Backend | **Node.js + TypeScript (NestJS)** with Prisma or Knex (raw SQL for posting paths) | Typed domain model; posting engine uses raw SQL transactions for full control over locking. (Equally valid: Laravel/PHP if team skill dictates.) |
| Queue/Jobs | **BullMQ on Redis** (managed Redis) | Webhook async processing, retries with backoff, cron scheduling, dead-letter queue. |
| Frontend | **React + Vite + TypeScript**, Tailwind, TanStack Query; Recharts for dashboards | SPA served via CDN; mobile-responsive (owners check phones). |
| Auth | Session-cookie or JWT w/ refresh; **TOTP 2FA mandatory** for OWNER/ACCOUNTANT | Financial data. |
| Hosting | Backend + worker on **Fly.io / Render / Railway** (2 processes: `api`, `worker`); or a single DigitalOcean droplet + Docker Compose for cost | Dhaka-adjacent region (Singapore) for latency. |
| Object storage | S3-compatible (receipt photos, settlement CSVs) | Cheap, durable. |
| Observability | Structured JSON logs → Grafana Cloud/Betterstack; Sentry for errors; uptime ping on webhook endpoint | The webhook endpoint being down silently is the #1 operational risk — alert on silence (no events for N hours during business hours). |
| IaC / CI | GitHub Actions: test → migrate (with `--dry-run` gate) → deploy; DB migrations via `node-pg-migrate`/Prisma Migrate | Migrations never run automatically against prod without the dry-run diff being reviewed. |

### 11.2 Service decomposition (modular monolith — deliberately NOT microservices)

```
apps/
  api/            HTTP: auth, portals (expenses, purchases, equity, assets,
                  settlements, stock counts), reporting queries, webhook receiver
  worker/         Queue consumers: nuport-event processor, cron pullers,
                  depreciation job, integrity verifier, hash-chain verifier
packages/
  ledger/         THE ONLY module allowed to write journal_entries/lines.
                  Exposes post(eventCode, sourceRef, lines[]) — validates against
                  posting_rules, wraps in transaction, maintains hash chain.
  inventory/      BOM explosion, MWA costing, movement writer (calls ledger)
  nuport-client/  Typed API client, auth, pagination, backoff
  domain/         Shared types, money arithmetic (integer-poisha internally)
```

A modular monolith with one database gives **cross-module ACID transactions** (revenue + COGS + stock in one commit) — the single most important correctness property here, and precisely what microservices would destroy.

### 11.3 Concurrency & correctness details

- All posting flows run at `ISOLATION LEVEL READ COMMITTED` with explicit `SELECT … FOR UPDATE` on: the order row (state transition), each `item_stock` row (in `item_id` order), and the entry-number counter.
- Queue concurrency for order processing = 4 workers; per-order serialization via a queue job-id = `nuport_order_ref` (BullMQ deduplication), so two events for the same order can never interleave.
- Money arithmetic in application code uses integer poisha (`bigint`) or `decimal.js` — **never IEEE floats**.

---

## 12. End-to-End Data Flow Map

### 12.1 Primary flow: Nuport delivery → dashboard refresh

```
[1] Steadfast marks parcel delivered → Nuport order status = "Delivered"
        │
        ▼
[2] Nuport Webhook  ──POST──▶  /api/v1/webhooks/nuport
        │                        • verify HMAC/secret
        │                        • INSERT nuport_events (RECEIVED)   ◀── idempotency
        │                        • enqueue job(order_ref)                gate #1:
        │                        • HTTP 200 (<200 ms)                    unique event id
        ▼
[3] Worker picks job (per-order serialized)
        │  • Re-fetch order from Nuport REST API (trust-but-verify)
        │  • Canonical fingerprint vs sales_orders               ◀── idempotency
        │  • Load/refresh sales_orders + lines                       gate #2:
        ▼                                                            fin_state machine
[4] Financial Event Processor  —— BEGIN TRANSACTION ——
        │
        ├─▶ [4a] State check: SYNCED → REVENUE_POSTED allowed? else no-op/exception
        │
        ├─▶ [4b] BOM MATCHING
        │         for each line: items.sku == nuport_sku → active BOM version
        │         explode & merge component requirements
        │         (missing SKU/BOM → NEEDS_BOM exception, revenue-only posting)
        │
        ├─▶ [4c] INVENTORY ASSET DEDUCTION
        │         lock item_stock rows (item_id order)
        │         write inventory_movements (−qty @ avg_cost each component)
        │         update on_hand; compute cogs_raw / cogs_pkg
        │
        ├─▶ [4d] LEDGER POSTING (packages/ledger)
        │         JE-A  Dr 1110 / Cr 4010 + 4020          (revenue)
        │         JE-B  Dr 5010+5020 / Cr 1310+1320       (COGS)
        │         hash-chain both entries; gapless entry_no
        │
        ├─▶ [4e] sales_orders: fin_state=REVENUE_POSTED, cogs snapshot,
        │         entry ids linked; nuport_events.status=PROCESSED
        │
        —— COMMIT ——  (any failure → full rollback, job retry w/ backoff,
        ▼              3 failures → dead-letter + integrity_alerts row)
[5] Post-commit: publish "ledger.updated" (Postgres NOTIFY / Redis pub-sub)
        │
        ▼
[6] REAL-TIME DASHBOARD REFRESH
        • account_balances materialized view refresh (incremental)
        • WebSocket/SSE push to connected dashboards
        • Cash panel: 1010 + 1020 + 1030 | Courier dues: 1110 drill-down
        • P&L today: 4010−4110−(5010+5020)−6xxx  → live net profit
```

### 12.2 Completeness loop (cron)

```
02:30 Dhaka daily:
  pull all orders updated_since cursor ──▶ fingerprint diff ──▶ enqueue changed
  pull SKU master ──▶ new SKUs → "unmapped SKU" exception queue
  Σ Nuport delivered totals (day) vs Σ posted revenue (day) ──▶ mismatch report (I5)
  advance cursor only on success
03:00 on the 1st:  depreciation job (idempotent per period)
03:30 daily:       integrity verifier (I1–I5) + hash-chain walk + item_stock replay check
```

### 12.3 Settlement flow

```
Steadfast statement CSV ─▶ Settlement portal upload ─▶ parse rows
  ─▶ auto-match by consignment/order ref ─▶ exceptions queue (human resolves)
  ─▶ all matched ─▶ preview JE-C (Dr Bank + Dr Courier charges / Cr 1110)
  ─▶ user confirms bank credit amount matches bank statement ─▶ POST (one txn)
  ─▶ matched orders → SETTLED ─▶ receivable aging updates
```

---

## 13. Dashboard & Reporting Specification

**Home (real-time, WebSocket-fed):**

- **Cash position strip:** Cash in Hand | Bank | bKash | *Courier Dues (1110)* | Total liquid — each card click-through to ledger detail.
- **Today/This week:** orders delivered, revenue, COGS, gross margin %, ad spend, net operating profit.
- **Courier receivable aging** bar (0–7/8–14/15–30/>30 days) with amount stuck per bucket.
- **Inventory health:** on-hand qty & value per raw/packaging item, days-of-cover (based on trailing 14-day BOM consumption), low-stock alerts.
- **Exception center:** unmapped SKUs, NEEDS_BOM orders, settlement mismatches, negative stock, integrity alerts — count badges; zero-inbox is the operational goal.

**Statements (any date range, all derived from journal_lines only):**

1. Profit & Loss (with COGS split raw vs packaging, per-SKU gross margin report from order COGS snapshots)
2. Balance Sheet (assets incl. net fixed assets; 2110 advances; partner equity section)
3. Cash Flow Statement (direct method — trivially derivable since every cash account is a ledger account)
4. Trial Balance, General Ledger drill-down, Journal browser (filter by event_code/source)
5. Partner statements (§7), Fixed-asset register w/ depreciation schedules, Inventory valuation & movement report, Courier settlement history

---

## 14. Failure Modes, Edge Cases & Recovery

| # | Scenario | Handling |
|---|----------|----------|
| 14.1 | **Duplicate webhook / webhook+cron race** | Idempotency gates: unique event id, payload-hash dedup, fin_state machine, per-order job serialization. Worst case = no-op. |
| 14.2 | **Order references SKU unknown to ERP** | Order stored, flagged `EXCEPTION/unmapped SKU`; no posting. Exception center prompts mapping (link to existing item or create+BOM); on resolution the order re-enters the pipeline automatically. |
| 14.3 | **SKU mapped but no BOM** | Revenue posts (money is real); COGS deferred; order state `NEEDS_BOM`. On BOM creation, a backfill job posts COGS dated to delivery period (if open) or current period. Blocks month-close until empty. |
| 14.4 | **Negative stock** (sold more than book qty) | Deduction proceeds at current avg_cost (revenue must not be blocked), `on_hand` goes negative, exception raised. Resolution = missing purchase entry or stock-count correction. Negative stock blocks month-close. |
| 14.5 | **Nuport edits an order after delivery** (amount change) | Cron fingerprint detects; system posts a delta adjustment entry (reversal + repost pattern), never edits. Flagged for human review above ৳500 delta. |
| 14.6 | **Webhook endpoint down for hours** | Nuport retries (per their policy) + hourly/daily cron guarantees eventual completeness; "no events during business hours" alert catches silent failure. |
| 14.7 | **Partial delivery** | Line-level delivered quantities from Nuport drive partial revenue+COGS; remainder follows RTO path. If Nuport lacks line-level data: full posting + return adjustment (documented, consistent). |
| 14.8 | **Purchase price entry error discovered later** | Reversal of purchase JE + corrected repost; MWA recalculated by replaying movements from the correction point (rebuild job); affected COGS deltas posted as adjustment entry with full report. |
| 14.9 | **Combo/multi-line orders** | Handled natively by BOM explosion merge (§5.4 step 2). |
| 14.10 | **DB restore after disaster** | PITR to minute granularity; after restore, cron re-pull with cursor rewound 7 days re-converges Nuport state; hash chain verifies untouched history. |

---

## 15. Security, Audit & Compliance

- **RBAC:** OWNER (all + period lock + user admin), ACCOUNTANT (post/reconcile/close), OPERATOR (expense & purchase entry only — cannot touch ledger directly or void), VIEWER (dashboards). Manual journal entry permission = OWNER only, and even then only via the ledger service (hash-chained, audited).
- **Secrets:** Nuport API key & webhook secret in platform secret manager; rotation procedure documented; key never logged (structured-log redaction list).
- **Transport/at rest:** TLS 1.2+ everywhere; managed-DB encryption at rest; S3 bucket private w/ signed URLs.
- **DB roles:** app role has no DDL; no human has prod write credentials day-to-day; break-glass role usage alarms.
- **Backups:** automated daily snapshot + WAL PITR (RPO ≤ 5 min), weekly restore drill (automated restore-and-verify job runs trial balance on the restored copy).
- **Audit:** every portal mutation → `audit_log` (before/after, user, IP); login history; 2FA enforced for financial roles.
- **Data retention:** raw `nuport_events` payloads retained ≥ 7 years (aligns with typical tax audit horizons in Bangladesh); ledger retained indefinitely.

---

## 16. Implementation Roadmap

| Phase | Weeks | Deliverable | Exit criterion |
|-------|-------|-------------|----------------|
| 0 | 1 | Nuport API discovery: real payload shapes, event names, line-level delivery granularity, webhook signing | Contract doc + recorded sample payloads for tests |
| 1 | 2–3 | Ledger core: accounts, journal engine, integrity triggers, hash chain, manual journal + trial balance | Post/verify entries; triggers reject unbalanced/mutation |
| 2 | 2 | Items, BOM versioning, purchases portal, MWA engine, stock counts | Purchase→stock→valuation matches ledger (I3 green) |
| 3 | 2–3 | Nuport ingestion (webhook+cron), order state machine, revenue+COGS pipeline, exception center | Replay 3 months of historical orders; I5 diff = 0 |
| 4 | 1–2 | Settlement portal + matching, receivable aging | One real Steadfast statement fully matched & posted |
| 5 | 1 | Expenses, equity, fixed assets + depreciation cron | Month-end close dry run passes checklist |
| 6 | 1–2 | Dashboards, statements, alerts, RBAC hardening, backup drill | Parallel run vs current bookkeeping for one full month; discrepancies = 0 or explained |
| GO | — | Cut over at a month boundary with opening balances posted as a `CLOSING`-type opening entry | Owner sign-off |

**Opening balances:** one-time wizard — count cash/bank/bKash, physical stock count (qty × known cost), courier dues from Steadfast portal, fixed assets at net book value, plug to partner capital per agreed split. Posted as the genesis journal entry (hash chain root).

---

*End of blueprint. This document is the implementation contract: any deviation during build (especially in §4 posting rules, §9 constraints, and §10 invariants) must be reflected here first.*
