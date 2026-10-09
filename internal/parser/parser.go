// Package parser holds the normalized transaction model shared by every
// import source (PDF statements and Android SMS) plus the money parser.
package parser

import (
	"fmt"
	"strconv"
	"strings"
)

// Transaction is one normalized M-Pesa movement, the common currency of the
// whole analysis pipeline. Amount and Balance are integer cents; a negative
// Amount is money out.
type Transaction struct {
	ID          string `json:"id"`
	Date        string `json:"date"` // formatted "2006-01-02 15:04:05"
	Description string `json:"description"`
	Status      string `json:"status"`
	Amount      int64  `json:"amount"`
	Balance     int64  `json:"balance"`
}

// ParseMoney parses a money string such as "1,204.50" or "-50.00" into
// integer cents.
func ParseMoney(data string) (int64, error) {
	value := strings.ReplaceAll(data, ",", "")
	parts := strings.SplitN(value, ".", 2)

	if len(parts) != 2 {
		return 0, fmt.Errorf("invalid money format: %q", data)
	}

	whole, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid whole part %q: %w", parts[0], err)
	}
	fraction, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid fraction part %q: %w", parts[1], err)
	}

	sign := int64(1)
	if whole < 0 {
		sign = -1
		whole = -whole
	}

	return sign * (whole*100 + fraction), nil
}
