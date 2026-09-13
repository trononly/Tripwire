// Package counterparty extracts the name of the person or business an
// M-Pesa transaction was made with. It is its own package so that both
// the analysis aggregations and the recurring-payment detector can use
// the same extraction without an import cycle between them.
package counterparty

import (
	"regexp"
	"strings"
)

var counterpartyRE = regexp.MustCompile(`(?i)\b(?:to|from)\s*(?:[\d*]+\s*)?-\s+(.+)$`)

// CounterpartyOf extracts the counterpart name from a description, e.g.
//
//	"Merchant Payment to 7408526 - FAITH NJOKI BACHIA" -> "FAITH NJOKI BACHIA"
//	"Pay Bill Online to 888880 - KPLC"                -> "KPLC"
//	"Funds received from - 07******752 Calvin Kamara" -> "Calvin Kamara"
//
// Masked phone-number prefixes ("07******752 ") are stripped. Returns ""
// when the description has no counterparty.
func CounterpartyOf(description string) string {
	m := counterpartyRE.FindStringSubmatch(description)
	if m == nil {
		return ""
	}
	name := strings.TrimSpace(m[1])
	// Strip leading masked numbers like "07******752" or "2547******103".
	for {
		fields := strings.Fields(name)
		if len(fields) < 2 || !isMaskedNumber(fields[0]) {
			break
		}
		name = strings.TrimSpace(strings.TrimPrefix(name, fields[0]))
	}
	return strings.TrimSpace(name)
}

func isMaskedNumber(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= '0' && c <= '9', c == '*':
		default:
			return false
		}
	}
	return strings.Contains(s, "*") && len(s) >= 8
}
