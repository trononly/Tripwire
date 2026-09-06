package parser

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Transaction struct {
	ID          string `json:"id"`
	Date        string `json:"date"` // formatted "2006-01-02 15:04:05"
	Description string `json:"description"`
	Status      string `json:"status"`
	Amount      int64 `json:"amount"`
	Balance     int64 `json:"balance"`
}

func cleanRubbish(data string) string {
	disclaimer := regexp.MustCompile(`(?s)Disclaimer.*?Page \d+ of \d+\s*\S+`)
	header := regexp.MustCompile(`Receipt No\.Completion TimeDetailsTransaction StatusPaid InWithdrawnBalance`)

	data = disclaimer.ReplaceAllString(data, "")
	data = header.ReplaceAllString(data, "")

	data = strings.ReplaceAll(data, "\n", " ")
	data = strings.ReplaceAll(data, "\r", "")

	return data
}

func parseMoney(data string) (int64, error) {
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

func ParseTX(data string) ([]Transaction, error) {
	data = cleanRubbish(data)
	row := regexp.MustCompile(
		`(?s)([A-Z0-9]+?)(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(.*?)(Completed|Failed)([+-]?[\d,]+\.\d{2})([\d,]+\.\d{2})`,
	)

	matches := row.FindAllStringSubmatch(data, -1)
	transactions := make([]Transaction, 0, len(matches))

	for _, match := range matches {
		date, err := time.Parse("2006-01-02 15:04:05", match[2])
		if err != nil {
			return nil, fmt.Errorf("invalid date %q: %w", match[2], err)
		}
		formattedDate := date.Format("2006-01-02 15:04:05")

		amount, err := parseMoney(match[5])
		if err != nil {
			return nil, fmt.Errorf("invalid amount %q: %w", match[5], err)
		}
		balance, err := parseMoney(match[6])
		if err != nil {
			return nil, fmt.Errorf("invalid balance %q: %w", match[6], err)
		}

		transactions = append(transactions, Transaction{
			ID:          match[1],
			Date:        formattedDate,
			Description: strings.TrimSpace(match[3]),
			Status:      match[4],
			Amount:      amount,
			Balance:     balance,
		})

	}
	return transactions, nil
}
