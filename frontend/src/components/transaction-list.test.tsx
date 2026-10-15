// Renders the transaction list against rows shaped exactly like the Wails
// bindings (TransactionView): the UI must be dumb about semantics - icon,
// title and subtitle come straight from the pre-computed `type` and
// `counterparty` fields, amounts stay signed integer cents.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { TransactionList, formatAmount } from "@/components/transaction-list";
import { typeStyle } from "@/lib/transaction-types";
import type { Group } from "@/components/transaction-list";
import type * as models from "../../bindings/mpesa-analyzer/models";

type Row = NonNullable<
  NonNullable<models.DayGroup>["txs"]
>[number];

function row(overrides: Partial<Row>): Row {
  return {
    id: "R1",
    date: "2026-04-28 14:22:05",
    description: "Merchant Payment to 7408526 - FAITH NJOKI BACHIA",
    status: "Completed",
    amount: -245000,
    balance: 1000000,
    category: "Buy Goods",
    type: "till",
    counterparty: "FAITH NJOKI BACHIA",
    ...overrides,
  };
}

const groups: Group[] = [
  {
    dayKey: "2026-04-28",
    endBalance: 1000000,
    txs: [
      row({ id: "R1", amount: -245000, type: "till", counterparty: "FAITH NJOKI BACHIA" }),
      row({
        id: "R2",
        description: "Customer Transfer to - JOHN DOE",
        amount: -50000,
        type: "send_money",
        counterparty: "JOHN DOE",
        category: "Send Money",
      }),
      row({
        id: "R3",
        description: "Airtime Purchase",
        amount: -50000,
        type: "airtime",
        counterparty: "",
        category: "Airtime",
      }),
      row({
        id: "R4",
        description: "Send Money Reversal via API from - HARDEEP SINGH",
        amount: 50000,
        type: "reversal",
        counterparty: "HARDEEP SINGH",
        category: "Other",
      }),
    ],
  },
];

describe("TransactionList", () => {
  it("renders the counterparty as the primary line", () => {
    render(<TransactionList groups={groups} showPagination={false} />);
    expect(screen.getByText("FAITH NJOKI BACHIA")).toBeInTheDocument();
    expect(screen.getByText("JOHN DOE")).toBeInTheDocument();
    expect(screen.getByText("HARDEEP SINGH")).toBeInTheDocument();
  });

  it("falls back to the type label when no counterparty exists", () => {
    render(<TransactionList groups={groups} showPagination={false} />);
    // "Airtime Purchase" names no counterparty: primary is the type label,
    // and the type label is not duplicated in the subtitle.
    expect(screen.getByText("Airtime")).toBeInTheDocument();
    expect(screen.queryByText("Airtime · 14:22")).not.toBeInTheDocument();
  });

  it("shows the type label with time as the subtitle", () => {
    render(<TransactionList groups={groups} showPagination={false} />);
    expect(screen.getByText("Buy Goods · 14:22")).toBeInTheDocument();
    expect(screen.getByText("Send Money · 14:22")).toBeInTheDocument();
  });

  it("maps types to distinct icons via plain lookup", () => {
    expect(typeStyle("till").icon).not.toBe(typeStyle("send_money").icon);
    expect(typeStyle("paybill").label).toBe("Pay Bill");
    expect(typeStyle("fuliza").label).toBe("Fuliza");
    expect(typeStyle("reversal").label).toBe("Reversal");
    // Unknown future types degrade gracefully instead of crashing.
    expect(typeStyle("something_new").label).toBe("Other");
  });

  it("renders signed amounts from integer cents without floats", () => {
    expect(formatAmount(-245000)).toBe("-KES 2,450.00");
    expect(formatAmount(50000)).toBe("+KES 500.00");
  });
});
