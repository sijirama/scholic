package main

import (
	"encoding/json"
	"fmt"
	"scholic/internal/scraper"
)

func main() {
	url := "https://github.com/PuerkitoBio/goquery"
	meta, err := scraper.ExtractMetadata(url)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	b, _ := json.MarshalIndent(meta, "", "  ")
	fmt.Printf("Metadata:\n%s\n", string(b))
}
