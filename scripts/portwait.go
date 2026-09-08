package main

import (
	"net/http"
	"os"
	"time"
)

// portwait waits for a TCP port to accept HTTP connections.
// Usage: go run portwait.go <port>
// Used by the "run" task to make sure the Vite dev server has bound its
// port before the app binary launches (see Taskfile.yml). Without this, the
// app can fatal with "unable to connect to frontend server" when the
// background frontend task hasn't started binding 127.0.0.1:<port> yet.
func main() {
	if len(os.Args) < 2 {
		panic("usage: go run portwait.go <port>")
	}
	url := "http://127.0.0.1:" + os.Args[1]
	client := http.Client{}
	for i := 0; i < 30; i++ {
		_, err := client.Get(url)
		if err == nil {
			print("Dev server ready:", url)
			return
		}
		time.Sleep(1 * time.Second)
	}
	panic("Dev server at " + url + " never came up after 30s")
}