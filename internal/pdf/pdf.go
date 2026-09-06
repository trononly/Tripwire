package pdf

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/dslipak/pdf"
)

func ReadPDF(path string, password string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	fi, err := file.Stat()
	if err != nil {
		return "", err
	}

	// The library calls this function repeatedly with candidate passwords
	// until it returns "". Hand out the password exactly once, then return
	// "" so a wrong PIN fails fast instead of looping forever.
	tried := false
	reader, err := pdf.NewReaderEncrypted(file, fi.Size(), func() string {
		if tried {
			return ""
		}
		tried = true
		return password
	})

	if err != nil {
		if errors.Is(err, pdf.ErrInvalidPassword) {
			return "", fmt.Errorf("invalid PIN")
		}
		return "", err
	}
	var b strings.Builder
	prevY := float64(1e9)

	for i := 1; i <= reader.NumPage(); i++ {
		c := reader.Page(i).Content()
		for _, text := range c.Text {
			if text.Y != prevY {
				if b.Len() > 0 {
					b.WriteString("\n")
				}
			}
			b.WriteString(text.S)
			prevY = text.Y
		}
	}
	return b.String(), nil
}
