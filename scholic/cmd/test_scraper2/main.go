package main

import (
	"encoding/json"
	"fmt"
	"scholic/internal/scraper"
)

func main() {
	url := "https://downloads.bbc.co.uk/worldservice/learningenglish/ask_about_english/pdfs/aae_sf_something_of_a.pdf"
	meta, err := scraper.ExtractMetadata(url)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	b, _ := json.MarshalIndent(meta, "", "  ")
	fmt.Printf("Metadata:\n%s\n", string(b))
}
