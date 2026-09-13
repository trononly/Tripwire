package recurring

// cadenceRule describes one recognized payment cadence.
type cadenceRule struct {
	name     string
	minGap   int64 // inclusive lower bound on the median gap, in days
	maxGap   int64 // inclusive upper bound on the median gap, in days
	maxMAD   int64 // largest tolerated median absolute gap deviation, in days
	minCount int   // minimum number of payments for this cadence
}

// cadenceRules defines the cadence windows and their regularity tolerances.
//
// Gap windows are deliberately non-overlapping with dead zones between
// them: a 10-day median gap matches neither weekly (5–9) nor bi-weekly
// (11–17), so a pattern must clearly match a cadence rather than merely be
// "close". The dead zones (10, 18–22, 38–75, 105+) cover mixed patterns
// such as semi-monthly payroll dates or skipped cycles that do not
// deserve a confident label.
//
// The MAD allowance grows with the cadence because the same deviation is
// far more significant for a short cycle: ±2 days on a weekly bill is a
// real timing change, while ±2 days on a monthly bill is ordinary noise —
// month lengths themselves alternate 28/30/31 days, which alone moves
// calendar-anchored monthly gaps by 2–3 days. Quarterly payments in real
// life drift around due dates by a couple of weeks.
//
// minCount trades recall against false positives per cadence. Weekly and
// bi-weekly events are frequent and cheap (top-ups, betting, weekly
// shopping), so three payments span only two to four weeks of history and
// are easily coincidental — four are required. Monthly and quarterly
// events are rarer and statements are commonly three to six months long:
// requiring four monthly payments would set a three-month history floor
// and four quarterly payments a nine-month floor, making those cadences
// nearly undetectable on real statements, so three payments (two gaps)
// remain the threshold there.
var cadenceRules = []cadenceRule{
	{name: "weekly", minGap: 5, maxGap: 9, maxMAD: 2, minCount: 4},
	{name: "bi-weekly", minGap: 11, maxGap: 17, maxMAD: 3, minCount: 4},
	{name: "monthly", minGap: 23, maxGap: 37, maxMAD: 6, minCount: 3},
	{name: "quarterly", minGap: 76, maxGap: 104, maxMAD: 14, minCount: 3},
}

// classifyCadence matches a median gap against the known cadence windows.
// ok is false when the gap matches no window (including "irregular").
func classifyCadence(medianGap int64) (cadenceRule, bool) {
	for _, r := range cadenceRules {
		if medianGap >= r.minGap && medianGap <= r.maxGap {
			return r, true
		}
	}
	return cadenceRule{}, false
}
