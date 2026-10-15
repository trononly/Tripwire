package suite

import (
	. "mpesa-analyzer/internal/analysis"
	"testing"

	"mpesa-analyzer/internal/txtype"
)

// TestTypeOf pins the deterministic classification to real description
// formats from actual M-Pesa statements (see test_data). The description
// - never the counterparty name, never the amount's sign - is the source
// of truth.
func TestTypeOf(t *testing.T) {
	cases := map[string]txtype.TransactionType{
		// Send money (person to person, both spellings).
		"Customer Transfer to - 254718***569 Derick Buyoywa": txtype.TypeSendMoney,
		"Send Money to - JOHN DOE":                           txtype.TypeSendMoney,
		// Pochi-style direct payment to a small business (129 real rows).
		"Customer Payment to Small Business to - 0708***428 Geoffrey Mwaura": txtype.TypeSendMoney,

		// Pay Bill - even when the biller is a bank; the description wins.
		"Pay Bill Online to 400200 - Co- operative Bank Money Transfer Acc. 01116307912400": txtype.TypePaybill,
		"Pay Bill to 888880 - KPLC PREPAID Acc. 01450540651":                                txtype.TypePaybill,

		// Buy Goods / Till - in-store and online merchant payments.
		"Merchant Payment to 6740327 - NAIROBI BUDGET BUTCHERY 2":    txtype.TypeTill,
		"Merchant Payment Online to 3118261 - DANSTAN MAYIANDA TOEL": txtype.TypeTill,
		"Buy Goods to 123456 - SHOP":                                 txtype.TypeTill,

		// Withdrawal - agent and ATM, both formats.
		"Agent Withdrawal": txtype.TypeWithdrawal,
		"Customer Withdrawal At Agent Till 2129251 - ORBIT SOLUTIONS ARKIMEDES BOOKSHOP VIJANA ROAD KALOLENI": txtype.TypeWithdrawal,
		"ATM Withdrawal": txtype.TypeWithdrawal,

		// Deposit.
		"Agent Deposit": txtype.TypeDeposit,
		"ATM Deposit":   txtype.TypeDeposit,

		// Airtime - own line and customer recharge.
		"Airtime Purchase": txtype.TypeAirtime,
		"Recharge for Customer to 150501SAFARICOMHOME by - 254796***192 PHILIP ATEMA": txtype.TypeAirtime,

		// Data bundles.
		"Customer Bundle Purchase to 4093441SAFARICOM DATA BUNDLES by - 07******192 PHILIP ATEMA": txtype.TypeBundles,
		"BUNDLES by - 07******192": txtype.TypeBundles,

		// Bank transfer - the kind phrase, not the bank in the name.
		"Transfer from Bank 517819 - IM BANK LIMITED- APP to Customer via API": txtype.TypeBankTransfer,
		"Bank Transfer to - NCBA": txtype.TypeBankTransfer,

		// Savings products.
		"Unit Trust Invest To 4145555 - ZIIDI MMF by M-PESA\\UnitTrust":      txtype.TypeSavings,
		"Unit Trust Withdraw From 4145555 - ZIIDI MMF by M- PESA\\UnitTrust": txtype.TypeSavings,
		"M-Shwari Deposit":  txtype.TypeSavings,
		"M-Shwari Withdraw": txtype.TypeSavings,

		// Fuliza / overdraft.
		"Fuliza M-Pesa":      txtype.TypeFuliza,
		"Overdraft (Charge)": txtype.TypeFuliza,

		// Incoming money - received from a person or paid out by a
		// business. Positive amounts are never assumed to be deposits.
		"Funds received from - 254712***752 Calvin Kamara":                                                         txtype.TypeReceive,
		"Business Payment from 300600 - Equity Bulk Account via API. Original conversation ID is EQA5744B30222B7.": txtype.TypeReceive,

		// Salary.
		"Salary Payment from 504900 - NCBA BANK via API. Original conversation ID is FTC260905LBBS.": txtype.TypeSalary,

		// Reversals - the kind being reversed must not win.
		"Send Money Reversal via API from - 254720***816 EMMANUEL MWANYAE": txtype.TypeReversal,
		"Pay Utility Reversal by  OKAVA KENYA LTD       \\New API user":    txtype.TypeReversal,

		// Fees.
		"Pay Bill Charge":                                         txtype.TypeFees,
		"Customer Transfer of Funds Charge":                       txtype.TypeFees,
		"Withdrawal Charge":                                       txtype.TypeFees,
		"FI Organization Savings Clent Check Credit Limit Charge": txtype.TypeFees,

		// Unknown semantics stay "other" - no invented meaning.
		"Term Loan Repayment for H- Fund": txtype.TypeOther,
		"Hello world":                     txtype.TypeOther,
		"":                                txtype.TypeOther,
	}
	for desc, want := range cases {
		if got := TypeOf(desc); got != want {
			t.Errorf("TypeOf(%q) = %q, want %q", desc, got, want)
		}
	}
}

// The category a type aggregates under (donut chart / category filter).
func TestCategoryOfMatchesType(t *testing.T) {
	cases := map[string]string{
		"Fuliza M-Pesa":   "Fees",
		"Pay Bill Charge": "Fees",
		"Customer Payment to Small Business to - 0708***428 Geoffrey Mwaura": "Send Money",
		"Unit Trust Invest To 4145555 - ZIIDI MMF by M-PESA\\UnitTrust":      "Bank & Savings",
		"Funds received from - Calvin Kamara":                                "Receive",
		"Salary Payment from 504900 - NCBA":                                  "Receive",
		"Send Money Reversal via API from - HARDEEP SINGH":                   "Other",
	}
	for desc, want := range cases {
		if got := CategoryOf(desc); got != want {
			t.Errorf("CategoryOf(%q) = %q, want %q", desc, got, want)
		}
	}
}
