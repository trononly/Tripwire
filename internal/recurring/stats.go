package recurring

import "slices"

// sortedCopy returns an ascending copy of values; the input is not mutated.
func sortedCopy(values []int64) []int64 {
	s := slices.Clone(values)
	slices.Sort(s)
	return s
}

// medianOfSorted returns the median of a non-empty ascending slice.
//
// With an odd number of values it is the middle value. With an even number
// the two middle values are averaged, rounding halves up; the inputs here
// are always non-negative (day counts and absolute cent amounts), so this
// is unambiguous. Rounding keeps the result an exact int64 - no floating
// point is used anywhere near money or day counts.
func medianOfSorted(sorted []int64) int64 {
	n := len(sorted)
	if n%2 == 1 {
		return sorted[n/2]
	}
	return (sorted[n/2-1] + sorted[n/2] + 1) / 2
}

// median returns the median of values in any order. ok is false for empty
// input; callers guard against that.
func median(values []int64) (int64, bool) {
	if len(values) == 0 {
		return 0, false
	}
	return medianOfSorted(sortedCopy(values)), true
}

// medianAbsoluteDeviation returns the median of the absolute deviations
// from the median: a robust measure of spread that a single outlier gap
// (e.g. a skipped month) cannot inflate, unlike the standard deviation.
func medianAbsoluteDeviation(values []int64) (int64, bool) {
	m, ok := median(values)
	if !ok {
		return 0, false
	}
	deviations := make([]int64, len(values))
	for i, v := range values {
		d := v - m
		if d < 0 {
			d = -d
		}
		deviations[i] = d
	}
	return median(deviations)
}
