package analysis

import (
	"mpesa-analyzer/internal/parser"
	"strings"
)

func TotalAmount(transactions []parser.Transaction) (totalIn, totalOut int64) {
	for _, tx := range transactions {
		if strings.Contains(tx.Description, "Charge") {
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
		if strings.Contains(tx.Description, "Charge") {
			totalFees += -tx.Amount
		}
	}
	return totalFees
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
