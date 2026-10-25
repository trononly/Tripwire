// Package phone normalizes Kenyan mobile numbers to the local 07…/01… form
// the USSD send flow expects. It is deliberately small: the app only sends
// M-Pesa to Kenyan mobiles, and the frontend has the same rules in
// `normalizePhone` (frontend/src/lib/ussd-menus.ts).
package phone

import "strings"

// Normalize returns the canonical local form ("0712345678") for a Kenyan
// mobile number, or "" when the input is not one.
//
// Accepted inputs include "0712 345 678", "+254 712 345 678",
// "254712345678", "00254 712 345 678" and the bare 9-digit "712345678".
func Normalize(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	d := b.String()

	switch {
	case len(d) == 14 && strings.HasPrefix(d, "00254"):
		d = "0" + d[5:]
	case len(d) == 13 && strings.HasPrefix(d, "2540"):
		// "+254 (0) 712 …"
		d = "0" + d[4:]
	case len(d) == 12 && strings.HasPrefix(d, "254"):
		d = "0" + d[3:]
	case len(d) == 9 && (d[0] == '7' || d[0] == '1'):
		d = "0" + d
	}

	if len(d) == 10 && (strings.HasPrefix(d, "07") || strings.HasPrefix(d, "01")) {
		return d
	}
	return ""
}
