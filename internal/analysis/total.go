package analysis

import (
	"mpesa-analyzer/internal/parser"
	"strings"
)

func TotalAmount(transactions []parser.Transaction) (totalIn, totalOut int64) {
	for _, tx := range transactions {
		if isFee(tx.Description) {
			continue
		}
		if tx.Amount < 0 {
			totalOut += -tx.Amount
		} else {
			totalIn += tx.Amount
		}

	}
	return totalIn, totalOut
}

func TotalFees(transactions []parser.Transaction) (totalFees int64) {
	for _, tx := range transactions {
		if isFee(tx.Description) {
			totalFees += -tx.Amount
		}
	}
	return totalFees
}

// isFee reports whether a description is a fee row: statement charge rows
// ("... Charge") plus the SMS-derived Fuliza access fee, which carries no
// "Charge" word but is still a fee rather than spend.
func isFee(description string) bool {
	if strings.Contains(description, "Charge") {
		return true
	}
	return strings.HasPrefix(description, "Fuliza Access Fee")
}

func NetAmount(transactions []parser.Transaction) (netAmount int64) {
	totalIn, totalOut := TotalAmount(transactions)
	totalFees := TotalFees(transactions)

	netAmount = totalIn - totalOut - totalFees
	return netAmount
}

func OpeningClosingBalance(transactions []parser.Transaction) (openingBalance, closingBalance int64) {
	if len(transactions) == 0 {
		return 0, 0
	}
	openingBalance = transactions[0].Balance
	closingBalance = transactions[len(transactions)-1].Balance
	return openingBalance, closingBalance
}
