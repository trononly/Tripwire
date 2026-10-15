// Package txtype classifies M-Pesa transaction descriptions into semantic
// transaction types. It is its own package so that both the analysis
// aggregations and the recurring-payment detector can use the same
// extraction without an import cycle between them.
package txtype

import "strings"

// TransactionType is the semantic kind of an M-Pesa transaction, derived
// deterministically from the statement description (the Details column).
// It drives the frontend's icon and secondary label; display names live
// in the Category mapping below.
type TransactionType string

const (
	TypeSendMoney    TransactionType = "send_money"
	TypePaybill      TransactionType = "paybill"
	TypeTill         TransactionType = "till"
	TypeBankTransfer TransactionType = "bank_transfer"
	TypeWithdrawal   TransactionType = "withdrawal"
	TypeDeposit      TransactionType = "deposit"
	TypeAirtime      TransactionType = "airtime"
	TypeBundles      TransactionType = "bundles"
	TypeFuliza       TransactionType = "fuliza"
	TypeReceive      TransactionType = "receive"
	TypeSalary       TransactionType = "salary"
	TypeSavings      TransactionType = "savings"
	TypeReversal     TransactionType = "reversal"
	TypeFees         TransactionType = "fees"
	TypeOther        TransactionType = "other"
)

// txRules classify a description by its transaction kind. Rules are
// matched case-insensitively against the START of the Details column —
// M-Pesa always begins the Details with the transaction kind — so the
// transaction's own type phrase wins and counterparties are never used
// to infer a type ("KPLC" never implies Pay Bill, "NCBA BANK" never
// implies a bank transfer). Order matters: more specific fee prefixes
// come before the kind phrases they'd otherwise be swallowed by
// ("Pay Bill Charge" before "Pay Bill").
var txRules = []struct {
	Prefixes []string
	Type     TransactionType
}{
	{[]string{"fuliza access fee"}, TypeFees},
	{[]string{"fuliza", "overdraft"}, TypeFuliza},
	{[]string{"pay bill charge"}, TypeFees},
	{[]string{"customer transfer of"}, TypeFees}, // "Customer Transfer of Funds Charge"
	{[]string{"withdrawal charge"}, TypeFees},

	{[]string{"customer transfer", "send money", "customer payment"}, TypeSendMoney},
	{[]string{"pay bill online", "pay bill to", "paybill"}, TypePaybill},
	{[]string{"merchant payment", "lipa na m-pesa", "buy goods"}, TypeTill},
	{[]string{"bank transfer", "transfer from bank"}, TypeBankTransfer},
	{[]string{"agent withdrawal", "atm withdrawal", "customer withdrawal at"}, TypeWithdrawal},
	{[]string{"agent deposit", "atm deposit"}, TypeDeposit},
	{[]string{"airtime purchase", "recharge for customer"}, TypeAirtime},
	{[]string{"customer bundle purchase", "bundles by"}, TypeBundles},
	{[]string{"funds received", "business payment"}, TypeReceive},
	{[]string{"salary payment"}, TypeSalary},
	{[]string{"m-shwari", "ziidi", "unit trust"}, TypeSavings},
}

// TypeOf classifies a transaction description into its semantic type.
// The description is the single source of truth; the amount's sign is
// never used to infer a type.
func TypeOf(description string) TransactionType {
	d := strings.ToLower(description)

	// Reversals embed the kind they undo ("Send Money Reversal via API
	// from - ...", "Pay Utility Reversal by ..."), so they are matched by
	// Contains BEFORE kind prefixes. Grounded in real statements: the
	// leading phrase of every reversal row contains "reversal".
	if strings.Contains(d, "reversal") {
		return TypeReversal
	}

	for _, rule := range txRules {
		for _, p := range rule.Prefixes {
			if strings.HasPrefix(d, strings.ToLower(p)) {
				return rule.Type
			}
		}
	}

	// Fallback for charge rows whose prefix didn't match any kind ("FI
	// Organization Savings Clent Check Credit Limit Charge"): real fee
	// rows all end in "Charge".
	if strings.Contains(d, "charge") {
		return TypeFees
	}

	return TypeOther
}

// categoryRules keeps the chart-facing display names. Derived from txRules
// so the two surfaces can never disagree.
var typeCategories = map[TransactionType]string{
	TypeSendMoney:    "Send Money",
	TypePaybill:      "Pay Bill",
	TypeTill:         "Buy Goods",
	TypeBankTransfer: "Bank Transfer",
	TypeWithdrawal:   "Withdraw",
	TypeDeposit:      "Deposit",
	TypeAirtime:      "Airtime",
	TypeBundles:      "Bundles",
	TypeFuliza:       "Fees",
	TypeReceive:      "Receive",
	TypeSalary:       "Receive",
	TypeSavings:      "Bank & Savings",
	TypeReversal:     "Other",
	TypeFees:         "Fees",
	TypeOther:        "Other",
}

// CategoryOf maps a description to a category display name (the labels the
// donut chart and category filter aggregate under). Same deterministic
// classification as TypeOf; only the presentation differs.
func CategoryOf(description string) string {
	if cat, ok := typeCategories[TypeOf(description)]; ok {
		return cat
	}
	return "Other"
}
