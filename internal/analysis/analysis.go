package analysis

import (
	"mpesa-analyzer/internal/parser"
	"mpesa-analyzer/internal/recurring"
)

// Totals bundles the summary KPIs.
type Totals struct {
	TotalIn        int64 `json:"totalIn"`        // cents
	TotalOut       int64 `json:"totalOut"`       // cents, positive
	TotalFees      int64 `json:"totalFees"`      // cents, positive
	Net            int64 `json:"net"`            // cents
	OpeningBalance int64 `json:"openingBalance"` // cents
	ClosingBalance int64 `json:"closingBalance"` // cents
	Count          int   `json:"count"`
}

// TotalsOf computes the summary KPIs for a set of transactions.
func TotalsOf(transactions []parser.Transaction) Totals {
	in, out := TotalAmount(transactions)
	fees := TotalFees(transactions)
	opening, closing := OpeningClosingBalance(transactions)
	return Totals{
		TotalIn:        in,
		TotalOut:       out,
		TotalFees:      fees,
		Net:            NetAmount(transactions),
		OpeningBalance: opening,
		ClosingBalance: closing,
		Count:          len(transactions),
	}
}

// AnalysisResult is everything the dashboard needs, computed in one call.
type AnalysisResult struct {
	Totals            Totals                       `json:"totals"`
	CashflowDaily     []CashflowBucket             `json:"cashflowDaily"`
	CashflowWeekly    []CashflowBucket             `json:"cashflowWeekly"`
	CashflowMonthly   []CashflowBucket             `json:"cashflowMonthly"`
	BalanceSeries     []BalancePoint               `json:"balanceSeries"`
	Categories        []CategoryTotal              `json:"categories"`
	TopCounterparties []Counterparty               `json:"topCounterparties"`
	RecurringPayments []recurring.RecurringPayment `json:"recurringPayments"`
	FeesByType        []FeeTotal                   `json:"feesByType"`
	// FulizaOutstanding is the estimated current Fuliza debt in positive
	// cents (0 when no disbursement exists). See FulizaOutstanding: the
	// latest stated outstanding minus later repayments.
	FulizaOutstanding int64 `json:"fulizaOutstanding"`
}

// Analyze computes the full analysis for a set of transactions.
func Analyze(transactions []parser.Transaction) (*AnalysisResult, error) {
	daily, err := Cashflow(transactions, "day")
	if err != nil {
		return nil, err
	}
	weekly, err := Cashflow(transactions, "week")
	if err != nil {
		return nil, err
	}
	monthly, err := Cashflow(transactions, "month")
	if err != nil {
		return nil, err
	}
	balance, err := BalanceTrajectory(transactions)
	if err != nil {
		return nil, err
	}

	return &AnalysisResult{
		Totals:            TotalsOf(transactions),
		CashflowDaily:     daily,
		CashflowWeekly:    weekly,
		CashflowMonthly:   monthly,
		BalanceSeries:     balance,
		Categories:        Categorize(transactions),
		TopCounterparties: TopCounterparties(transactions, 5),
		RecurringPayments: recurring.DetectRecurringPayments(transactions),
		FeesByType:        FeesByType(transactions),
		FulizaOutstanding: FulizaOutstanding(transactions),
	}, nil
}
