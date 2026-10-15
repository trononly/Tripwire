//go:build ignore

// One-shot dev tool: regex scratchpad.
package main

import (
	"fmt"
	"regexp"
)

func show(label, re string, s string) {
	rx := regexp.MustCompile(re)
	fmt.Printf("%s: %q\n", label, s)
	for _, m := range rx.FindAllStringSubmatch(s, -1) {
		for i := 0; i < len(m); i++ {
			fmt.Printf("  [%d] = %q\n", i, m[i])
		}
	}
}

func main() {
	toFrom := `(?i)\b(?:to|from)\s*(?:([\d*]+)\s+)?-\s+(.+)$`
	show("A: transfer-from-bank", toFrom, "Transfer from Bank - IM BANK LIMITED- APP to Customer via API")
	show("B: bundle 826915", toFrom, "Customer Bundle Purchase to 826915Safaricom Offers by - 07******192 PHILIP ATEMA")
	show("C: m-shwari", toFrom, "M-Shwari Deposit")
	show("D: merchant", toFrom, "Merchant Payment to 5525368 - SAMOSA WORLD KENYA LIMITED")
	show("E: funds", toFrom, "Funds received from - 07******752 Calvin Kamara")
	show("F: bundle-by", `(?i)\bby\s*-\s*(?:[\d*]+\s+)?(.+)$`, "Customer Bundle Purchase to 826915Safaricom Offers by - 07******192 PHILIP ATEMA")
	show("G: till", `(?i)\bto\s+([\d]{3,})\b`, "Customer Bundle Purchase to 826915Safaricom Offers by - 07******192 PHILIP ATEMA")
	show("H: tail", `(?i)\s*(?:via api|app to customer|by m-|acc\.).*$`, "- IM BANK LIMITED- APP to Customer via API")
}