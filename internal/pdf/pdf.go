package pdf

import (
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

	reader, err := pdf.NewReaderEncrypted(file, fi.Size(), func() string { return password })

	if err != nil {
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
