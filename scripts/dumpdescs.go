//go:build ignore

// One-shot dev tool: dump statement descriptions from a PDF.
package main

import (
	"fmt"
	"os"

	"mpesa-analyzer/internal/pdf"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: dumpdescs <pdf> [password]")
		return
	}
	password := ""
	if len(os.Args) > 2 {
		password = os.Args[2]
	}
	txs, err := pdf.ReadPDFTX(os.Args[1], password)
	if err != nil {
		fmt.Println("err:", err)
		return
	}
	for i := 0; i < len(txs); i++ {
		tx := txs[i]
		fmt.Printf("%s | %+d | %q\n", tx.Date, tx.Amount, tx.Description)
	}
	fmt.Printf("--- %d txs ---\n", len(txs))
}