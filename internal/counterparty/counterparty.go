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
		if len(fields) < 2 || !IsMaskedNumber(fields[0]) {
			break
		}
		name = strings.TrimSpace(strings.TrimPrefix(name, fields[0]))
	}
	return strings.TrimSpace(name)
}

func IsMaskedNumber(s string) bool {
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

// GroupKey normalizes a display name for aggregation so one real-world
// counterparty is not fragmented across bars by casing or phone-number
// formatting: "Calvin Kamara 0712544752", "Calvin Kamara 0712***752"
// and "CALVIN KAMARA 0141663900" all key identically. Trailing number
// tokens are dropped only when other name words remain, so a bare number
// never collapses to an empty key. Different names never merge.
func GroupKey(name string) string {
	fields := strings.Fields(name)
	for len(fields) > 1 && isPhoneToken(fields[len(fields)-1]) {
		fields = fields[:len(fields)-1]
	}
	return strings.ToUpper(strings.Join(fields, " "))
}

// isPhoneToken reports whether s looks like a trailing phone number,
// masked ("0712***752") or not ("0712544752"). Short numeric tokens
// ("114") are account references, not phone numbers, and are kept.
func isPhoneToken(s string) bool {
	if len(s) < 7 {
		return false
	}
	digits := 0
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= '0' && c <= '9':
			digits++
		case c == '*':
		default:
			return false
		}
	}
	return digits > 0
}
