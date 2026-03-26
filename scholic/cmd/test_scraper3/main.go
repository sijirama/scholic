package main

import (
	"encoding/json"
	"fmt"
	"scholic/internal/scraper"
)

func main() {
	urls := []string{
		"https://www.nature.com/articles/s41586-023-05881-x",
		"https://medium.com/@scholica/welcome-to-scholica-9a997a6a4a2a",
		"https://www.science.org/doi/10.1126/science.ade1225",
	}

	for _, url := range urls {
		fmt.Printf("\nTesting URL with improved ExtractMetadata: %s\n", url)
		meta, err := scraper.ExtractMetadata(url)
		if err != nil {
			fmt.Printf("Error: %v\n", err)
			continue
		}
		
		b, _ := json.MarshalIndent(meta, "", "  ")
		fmt.Printf("Result:\n%s\n", string(b))
	}
}
