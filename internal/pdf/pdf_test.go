package pdf

import (
	"os"
	"testing"
	"time"

	"mpesa-analyzer/internal/parser"
)

const (
	testPDF = "../../test_data/MPESA_Statement_2026-04-30_to_2026-03-28_2547xxxxxx192.pdf"
	testPIN = "470038"
)

func requireTestPDF(t *testing.T) {
	t.Helper()
	if _, err := os.Stat(testPDF); err != nil {
		t.Skip("test PDF not available")
	}
}

// withTimeout runs fn in a goroutine and fails the test if it hangs,
// mirroring the wrong-password hang regression the dslipak path once had.
func withTimeout(t *testing.T, name string, fn func() error) error {
	t.Helper()
	done := make(chan error, 1)
	go func() { done <- fn() }()
	select {
	case err := <-done:
		return err
	case <-time.After(15 * time.Second):
		t.Fatalf("HANG: %s did not return within 15s", name)
		return nil
	}
}

func TestReadPDFWrongPassword(t *testing.T) {
	requireTestPDF(t)
	err := withTimeout(t, "ReadPDF(wrong PIN)", func() error {
		_, err := ReadPDF(testPDF, "0000")
		return err
	})
	if err == nil {
		t.Error("dslipak: expected error for wrong password, got nil")
	} else {
		t.Logf("dslipak wrong password -> %v", err)
	}
}

func TestReadPDFTXWrongPassword(t *testing.T) {
	requireTestPDF(t)
	err := withTimeout(t, "ReadPDFTX(wrong PIN)", func() error {
		_, err := ReadPDFTX(testPDF, "0000")
		return err
	})
	if err == nil {
		t.Error("gopdf: expected error for wrong password, got nil")
	} else {
		t.Logf("gopdf wrong password -> %v", err)
	}
}

// TestGopdfBalanceChain validates the gopdf pipeline without needing the
// regex parser as an oracle: in a statement, every balance equals the
// previous balance plus the transaction amount.
func TestGopdfBalanceChain(t *testing.T) {
	requireTestPDF(t)
	var txs []parser.Transaction
	err := withTimeout(t, "ReadPDFTX(correct PIN)", func() error {
		var err error
		txs, err = ReadPDFTX(testPDF, testPIN)
		return err
	})
	if err != nil {
		t.Fatalf("gopdf pipeline failed: %v", err)
	}
	if len(txs) == 0 {
		t.Fatal("no transactions extracted")
	}
	// The statement lists transactions newest-first, so an older row's
	// balance plus the newer row's amount equals the newer row's balance.
	// M-Pesa prints paired "Pay Bill Charge" fee rows with a balance from
	// elsewhere in the chain, which trips this heuristic — that quirk is
	// present in the source data (both pipelines produce identical rows),
	// so log it rather than fail.
	breaks := 0
	for i := 1; i < len(txs); i++ {
		if txs[i].Balance+txs[i-1].Amount != txs[i-1].Balance {
			breaks++
			t.Logf("balance chain break at row %d (%s): older=%d newerAmount=%d newer=%d",
				i, txs[i].ID, txs[i].Balance, txs[i-1].Amount, txs[i-1].Balance)
		}
	}
	if breaks > len(txs)/10 {
		t.Errorf("too many balance chain breaks: %d of %d rows", breaks, len(txs))
	}
	t.Logf("%d transactions, %d balance chain breaks (M-Pesa fee-row quirk)", len(txs), breaks)
}

// TestComparePipelines runs both implementations and diffs the results.
func TestComparePipelines(t *testing.T) {
	requireTestPDF(t)

	var oldTxs, newTxs []parser.Transaction
	var oldErr, newErr error

	if err := withTimeout(t, "dslipak pipeline", func() error {
		text, err := ReadPDF(testPDF, testPIN)
		if err != nil {
			return err
		}
		oldTxs, oldErr = parser.ParseTX(text)
		return oldErr
	}); err != nil {
		t.Fatalf("dslipak pipeline failed: %v", err)
	}

	if err := withTimeout(t, "gopdf pipeline", func() error {
		newTxs, newErr = ReadPDFTX(testPDF, testPIN)
		return newErr
	}); err != nil {
		t.Fatalf("gopdf pipeline failed: %v", err)
	}

	t.Logf("dslipak+regex: %d transactions | gopdf tables: %d transactions", len(oldTxs), len(newTxs))

	if len(oldTxs) != len(newTxs) {
		t.Errorf("transaction count differs: dslipak=%d gopdf=%d", len(oldTxs), len(newTxs))
	}

	descDiffs := 0
	n := min(len(oldTxs), len(newTxs))
	for i := 0; i < n; i++ {
		o, g := oldTxs[i], newTxs[i]
		if o.ID != g.ID || o.Date != g.Date || o.Amount != g.Amount || o.Balance != g.Balance {
			t.Errorf("row %d differs:\n  dslipak: %+v\n  gopdf:   %+v", i, o, g)
			continue
		}
		if o.Description != g.Description {
			descDiffs++
			if descDiffs <= 5 {
				t.Logf("desc diff row %d (%s):\n  dslipak: %q\n  gopdf:   %q", i, o.ID, o.Description, g.Description)
			}
		}
	}
	t.Logf("identical ID/date/amount/balance on %d rows; %d description diffs", n, descDiffs)
}
