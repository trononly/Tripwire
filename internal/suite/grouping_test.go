package suite

import (
	. "mpesa-analyzer/internal/analysis"
	"strings"
	"testing"
	"time"

	"mpesa-analyzer/internal/parser"
)

func mktx(date, description string, amount, balance int64) parser.Transaction {
	return parser.Transaction{
		ID: "TEST123", Date: date, Description: description,
		Status: "Completed", Amount: amount, Balance: balance,
	}
}

func allFilter() TransactionFilter {
	return TransactionFilter{Search: "", Category: "all", Direction: "all", FromDate: "", ToDate: ""}
}

type splitCase struct {
	Desc string
	Name string
	Ref  string
}

func TestSplitTransaction(t *testing.T) {
	cases := []splitCase{
		{"Merchant Payment to 5525368 - SAMOSA WORLD KENYA LIMITED", "SAMOSA WORLD KENYA LIMITED", "5525368"},
		{"Funds received from - 07******752 Calvin Kamara", "Calvin Kamara", "07******752"},
		{"Salary Payment from 504900 - NCBA BANK via API. Original conversation ID is FTC260330HEOX.", "NCBA BANK", "504900"},
		{"Pay Bill to 888880 - KPLC PREPAID Acc. 01450540651", "KPLC PREPAID", "888880"},
		{"Customer Transfer to - 2547******705 WALTER KAGUCHIA", "WALTER KAGUCHIA", "2547******705"},
		{"Customer Payment to Small Business to - 07******642 VICTOR MUSYOKI", "VICTOR MUSYOKI", "07******642"},
		{"Unit Trust Invest To 4145555 - ZIIDI MMF by M-PESA\\UnitTrust", "ZIIDI MMF", "4145555"},
		{"Transfer from Bank - IM BANK LIMITED- APP to Customer via API", "IM BANK LIMITED", "TEST123"},
		{"Send Money Reversal via API from - HARDEEP SINGH", "HARDEEP SINGH", "TEST123"},
		{"Customer Bundle Purchase to 826915Safaricom Offers by - 07******192 PHILIP ATEMA", "PHILIP ATEMA", "826915"},
		{"Customer Bundle Purchase to 4093441SAFARICOM DATA BUNDLES by - 07******192 PHILIP ATEMA", "PHILIP ATEMA", "4093441"},
		{"Customer Transfer of Funds Charge", "Transfer charge", "TEST123"},
		{"Pay Bill Charge", "Paybill charge", "TEST123"},
		{"Airtime Purchase", "Airtime", "TEST123"},
		{"M-Shwari Deposit", "M-Shwari", "TEST123"},
	}
	for _, c := range cases {
		name, ref := SplitTransaction(mktx("2026-04-01 12:00:00", c.Desc, -100, 200))
		if name != c.Name {
			t.Errorf("SplitTransaction(%q) name = %q, want %q", c.Desc, name, c.Name)
		}
		if ref != c.Ref {
			t.Errorf("SplitTransaction(%q) ref = %q, want %q", c.Desc, ref, c.Ref)
		}
	}
}

func TestSplitTransactionFallbacks(t *testing.T) {
	// Receipt number is the reference fallback when the description has none.
	tx := parser.Transaction{
		ID: "SEDNCVFNGR", Date: "2026-04-01 12:00:00", Description: "Airtime Purchase",
		Status: "Completed", Amount: -500, Balance: 44679,
	}
	name, ref := SplitTransaction(tx)
	if name != "Airtime" || ref != "SEDNCVFNGR" {
		t.Errorf("fallback: got (%q, %q), want (Airtime, SEDNCVFNGR)", name, ref)
	}

	// Long IDs and names are truncated consistently (lengths are runes,
	// so the multibyte ellipsis never breaks the budget).
	long := parser.Transaction{
		ID: "SEDNCVFNGR", Date: "2026-04-01 12:00:00",
		Description: "Merchant Payment to 123456 - " + "EXTREMELY LONG MERCHANT BUSINESS NAME PLACED HERE FOR TESTING",
		Status:      "Completed", Amount: -500, Balance: 44679,
	}
	name, ref = SplitTransaction(long)
	if len([]rune(name)) > MaxNameLen || !strings.HasSuffix(name, "…") {
		t.Errorf("long name not truncated: %q (%d runes)", name, len([]rune(name)))
	}
	if ref != "123456" {
		t.Errorf("till ref should pass through untruncated, got %q", ref)
	}

	// A long receipt number used as the fallback reference is truncated.
	longID := parser.Transaction{
		ID: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", Date: "2026-04-01 12:00:00", Description: "Airtime Purchase",
		Status: "Completed", Amount: -500, Balance: 44679,
	}
	_, ref = SplitTransaction(longID)
	if len([]rune(ref)) > MaxRefLen || !strings.HasSuffix(ref, "…") {
		t.Errorf("long ref not truncated: %q (%d runes)", ref, len([]rune(ref)))
	}
}

func TestCategoryKeyOf(t *testing.T) {
	cases := map[string]string{
		"Merchant Payment to 5525368 - SAMOSA WORLD KENYA LIMITED": "buy_goods",
		"Pay Bill Online to 888880 - KPLC":                         "pay_bill",
		"Funds received from - Calvin Kamara":                      "receive",
		"Airtime Purchase":                                         "airtime",
		"Customer Transfer to - John":                              "send_money",
		"Agent Withdrawal":                                         "withdraw",
		"Customer Bundle Purchase to 826915 - PHILIP ATEMA":        "buy_goods",
		"Agent Deposit":                                            "receive",
		"Pay Bill Charge":                                          "other",
		"ZIIDI MMF by M-PESA\\UnitTrust":                           "other",
		"Hello world":                                              "other",
	}
	for desc, want := range cases {
		if got := CategoryKeyOf(desc); got != want {
			t.Errorf("CategoryKeyOf(%q) = %q, want %q", desc, got, want)
		}
	}
}

func TestGroupedTransactions(t *testing.T) {
	now := time.Now()
	today := now.Format("2006-01-02")
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")

	// Amounts and balances are integer cents; rows and headers expose KES.
	txs := []parser.Transaction{
		mktx(yesterday+" 10:00:00", "Funds received from - 07******752 Calvin Kamara", 3000, 76079),
		mktx(yesterday+" 09:00:00", "Airtime Purchase", -500, 73079),
		mktx(today+" 08:00:00", "Merchant Payment to 5525368 - SAMOSA WORLD KENYA LIMITED", -7000, 45179),
		mktx(today+" 07:00:00", "Customer Transfer of Funds Charge", -105, 52179),
		mktx("2024-01-15 12:00:00", "Agent Withdrawal", -2000, 1000),
	}
	groups := GroupedTransactions(txs, allFilter())

	if len(groups) != 3 {
		t.Fatalf("want 3 groups, got %d", len(groups))
	}

	// Newest day first, with Today/Yesterday labels.
	if groups[0].DateLabel != "Today, "+now.Format("2 Jan") {
		t.Errorf("group 0 label %q, want Today", groups[0].DateLabel)
	}
	if groups[1].DateLabel != "Yesterday, "+now.AddDate(0, 0, -1).Format("2 Jan") {
		t.Errorf("group 1 label %q, want Yesterday", groups[1].DateLabel)
	}
	if groups[2].DateLabel != "15 Jan 2024" {
		t.Errorf("group 2 label %q, want 15 Jan 2024", groups[2].DateLabel)
	}

	// Group header carries the true end-of-day balance, in KES.
	if groups[0].BalanceAfter != 451.79 {
		t.Errorf("group 0 balance %v, want 451.79", groups[0].BalanceAfter)
	}
	if groups[1].BalanceAfter != 760.79 {
		t.Errorf("group 1 balance %v, want 760.79", groups[1].BalanceAfter)
	}

	// Rows newest-first within the day, fully mapped.
	rows := groups[0].Transactions
	if len(rows) != 2 {
		t.Fatalf("want 2 rows in group 0, got %d", len(rows))
	}
	r := rows[0]
	if r.Time != "08:00" || r.Description != "SAMOSA WORLD KENYA LIMITED" ||
		r.Category != "buy_goods" || r.Direction != "out" ||
		r.Amount != -70.0 || r.BalanceAfter != 451.79 || r.Reference != "5525368" {
		t.Errorf("row 0 wrong: %+v", r)
	}
	r = rows[1]
	if r.Time != "07:00" || r.Description != "Transfer charge" ||
		r.Category != "other" || r.Direction != "out" || r.Amount != -1.05 {
		t.Errorf("row 1 wrong: %+v", r)
	}

	// Yesterday: receive row first, then airtime.
	rows = groups[1].Transactions
	if len(rows) != 2 || rows[0].Description != "Calvin Kamara" || rows[0].Category != "receive" ||
		rows[0].Direction != "in" || rows[0].Amount != 30.0 || rows[0].Reference != "07******752" {
		t.Errorf("yesterday rows wrong: %+v", rows)
	}
}

func TestGroupedTransactionsFiltered(t *testing.T) {
	now := time.Now()
	today := now.Format("2006-01-02")
	txs := []parser.Transaction{
		mktx(today+" 08:00:00", "Merchant Payment to 5525368 - SAMOSA WORLD KENYA LIMITED", -7000, 100),
		mktx(today+" 07:00:00", "Pay Bill Online to 888880 - KPLC", -5000, 200),
		mktx(today+" 06:00:00", "Funds received from - 07******752 Calvin Kamara", 9000, 300),
	}

	byCategory := GroupedTransactions(txs, TransactionFilter{Search: "", Category: "pay_bill", Direction: "all", FromDate: "", ToDate: ""})
	if len(byCategory) != 1 || len(byCategory[0].Transactions) != 1 ||
		byCategory[0].Transactions[0].Description != "KPLC" {
		t.Errorf("category filter failed: %+v", byCategory)
	}
	// Legacy display names still match (dashboard deep links pass "Buy Goods").
	byDisplay := GroupedTransactions(txs, TransactionFilter{Search: "", Category: "Buy Goods", Direction: "all", FromDate: "", ToDate: ""})
	if len(byDisplay[0].Transactions) != 1 || byDisplay[0].Transactions[0].Description != "SAMOSA WORLD KENYA LIMITED" {
		t.Errorf("display-name category filter failed: %+v", byDisplay)
	}

	byDirection := GroupedTransactions(txs, TransactionFilter{Search: "", Category: "all", Direction: "in", FromDate: "", ToDate: ""})
	if len(byDirection[0].Transactions) != 1 || byDirection[0].Transactions[0].Direction != "in" {
		t.Errorf("direction filter failed: %+v", byDirection)
	}

	bySearch := GroupedTransactions(txs, TransactionFilter{Search: "calvin", Category: "all", Direction: "all", FromDate: "", ToDate: ""})
	if len(bySearch[0].Transactions) != 1 || bySearch[0].Transactions[0].Description != "Calvin Kamara" {
		t.Errorf("search filter failed: %+v", bySearch)
	}

	byDate := GroupedTransactions(txs, TransactionFilter{Search: "", Category: "all", Direction: "all", FromDate: "2000-01-01", ToDate: "2000-12-31"})
	if len(byDate) != 0 {
		t.Errorf("date filter should empty the list: %+v", byDate)
	}

	empty := GroupedTransactions([]parser.Transaction{}, allFilter())
	if len(empty) != 0 {
		t.Errorf("expected no groups for empty input, got %d", len(empty))
	}
}

func TestPeriodSummary(t *testing.T) {
	now := time.Now()
	today := now.Format("2006-01-02")
	txs := []parser.Transaction{
		mktx(today+" 08:00:00", "Merchant Payment to 5525368 - SAMOSA WORLD KENYA LIMITED", -7000, 100),
		mktx(today+" 07:45:00", "Customer Transfer of Funds Charge", -105, 200),
		mktx(today+" 07:00:00", "Airtime Purchase", -500, 300),
		mktx(today+" 06:00:00", "Funds received from - 07******752 Calvin Kamara", 9000, 400),
	}

	s := PeriodSummaryOf(txs, allFilter())
	if s.TotalIn != 90.0 || s.TotalOut != 76.05 {
		t.Errorf("totals wrong: %+v", s)
	}
	if s.TopCategory != "buy_goods" || s.TopCategoryAmount != 70.0 {
		t.Errorf("top category wrong: %+v", s)
	}

	// Filtered to receiving only: top falls back to the inflow.
	byIn := PeriodSummaryOf(txs, TransactionFilter{Search: "", Category: "all", Direction: "in", FromDate: "", ToDate: ""})
	if byIn.TotalIn != 90.0 || byIn.TotalOut != 0.0 || byIn.TopCategory != "receive" || byIn.TopCategoryAmount != 90.0 {
		t.Errorf("in-only summary wrong: %+v", byIn)
	}

	// Charges are included (reconciles with the visible rows).
	byCategory := PeriodSummaryOf(txs, TransactionFilter{Search: "", Category: "other", Direction: "all", FromDate: "", ToDate: ""})
	if byCategory.TotalOut != 1.05 || byCategory.TopCategory != "other" || byCategory.TopCategoryAmount != 1.05 {
		t.Errorf("charges should be included: %+v", byCategory)
	}

	empty := PeriodSummaryOf([]parser.Transaction{}, allFilter())
	if empty.TotalIn != 0.0 || empty.TotalOut != 0.0 || empty.TopCategory != "" || empty.TopCategoryAmount != 0.0 {
		t.Errorf("empty summary should be zeroed: %+v", empty)
	}
}
