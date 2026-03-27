package scraper

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

type LinkMetadata struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Image       string `json:"image"`
	Favicon     string `json:"favicon"`
	Domain      string `json:"domain"`
}

// ExtractMetadata fetches a URL and extracts OpenGraph and basic HTML metadata using goquery.
func ExtractMetadata(url string) (*LinkMetadata, error) {
	// Attempt to resolve PDF URLs to their HTML abstract equivalents
	if strings.Contains(url, "arxiv.org/pdf/") {
		url = strings.Replace(url, "/pdf/", "/abs/", 1)
		url = strings.TrimSuffix(url, ".pdf")
	} else if strings.Contains(url, "pubmed.ncbi.nlm.nih.gov") && strings.HasSuffix(url, ".pdf") {
		url = strings.TrimSuffix(url, ".pdf")
	}

	// Create an HTTP client with proper TLS and quick timeouts
	customTransport := http.DefaultTransport.(*http.Transport).Clone()
	customTransport.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}

	client := &http.Client{
		Timeout:   12 * time.Second,
		Transport: customTransport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 20 {
				return fmt.Errorf("stopped after 20 redirects")
			}
			return nil
		},
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Referer", "https://www.google.com/")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")
	req.Header.Set("Sec-Ch-Ua", `"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"`)
	req.Header.Set("Sec-Ch-Ua-Mobile", "?0")
	req.Header.Set("Sec-Ch-Ua-Platform", `"Windows"`)
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Sec-Fetch-User", "?1")
	req.Header.Set("Upgrade-Insecure-Requests", "1")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Read up to 100KB (increased from 50KB to accommodate larger heads)
	limitReader := io.LimitReader(resp.Body, 100*1024)
	bodyBytes, err := io.ReadAll(limitReader)
	if err != nil && err != io.EOF {
		return nil, err
	}

	// Fast fail if this is actually a PDF binary
	if len(bodyBytes) > 4 && string(bodyBytes[:4]) == "%PDF" {
		domain := extractDomain(url)
		return &LinkMetadata{
			Domain:      domain,
			Title:       "PDF Document",
			Description: "View PDF document hosted on " + domain,
		}, nil
	}

	doc, err := goquery.NewDocumentFromReader(bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	meta := &LinkMetadata{
		Domain: extractDomain(url),
	}

	// 1. Title: Prefer og:title, then title tag
	if val, ok := doc.Find(`meta[property="og:title"]`).Attr("content"); ok && val != "" {
		meta.Title = val
	} else if val, ok := doc.Find(`meta[name="twitter:title"]`).Attr("content"); ok && val != "" {
		meta.Title = val
	} else {
		meta.Title = doc.Find("title").First().Text()
	}

	// 2. Description: og:description, then twitter:description, then meta description
	if val, ok := doc.Find(`meta[property="og:description"]`).Attr("content"); ok && val != "" {
		meta.Description = val
	} else if val, ok := doc.Find(`meta[name="twitter:description"]`).Attr("content"); ok && val != "" {
		meta.Description = val
	} else if val, ok := doc.Find(`meta[name="description"]`).Attr("content"); ok && val != "" {
		meta.Description = val
	}

	// 3. Image: og:image, then twitter:image
	if val, ok := doc.Find(`meta[property="og:image"]`).Attr("content"); ok && val != "" {
		meta.Image = val
	} else if val, ok := doc.Find(`meta[name="twitter:image"]`).Attr("content"); ok && val != "" {
		meta.Image = val
	}

	// 4. Favicon
	if val, ok := doc.Find(`link[rel*="icon"]`).First().Attr("href"); ok && val != "" {
		favicon := val
		if !strings.HasPrefix(favicon, "http") {
			domainParts := strings.Split(url, "/")
			if len(domainParts) >= 3 {
				baseURL := domainParts[0] + "//" + domainParts[2]
				if strings.HasPrefix(favicon, "/") {
					favicon = baseURL + favicon
				} else {
					favicon = baseURL + "/" + favicon
				}
			}
		}
		meta.Favicon = favicon
	}

	// 5. Custom Domain Enhancements
	// GitHub Stars & Forks
	if meta.Domain == "github.com" {
		stars := strings.TrimSpace(doc.Find("#repo-stars-counter-star").AttrOr("title", ""))
		if stars == "" {
			stars = strings.TrimSpace(doc.Find(".Counter.js-social-count").Text())
		}
		if stars != "" {
			if meta.Description != "" {
				meta.Description = "⭐ " + stars + " • " + meta.Description
			} else {
				meta.Description = "⭐ " + stars
			}
		}
	}

	// Academic Authors and Dates (arXiv, PubMed, etc.)
	if meta.Domain == "arxiv.org" || strings.Contains(meta.Domain, "ncbi.nlm.nih.gov") {
		var authors []string
		doc.Find(`meta[name="citation_author"]`).Each(func(i int, s *goquery.Selection) {
			if i < 10 { // Limit to 10 authors
				if val, ok := s.Attr("content"); ok {
					authors = append(authors, val)
				}
			}
		})

		if len(authors) > 0 {
			authorStr := "Authors: " + strings.Join(authors, ", ")
			if doc.Find(`meta[name="citation_author"]`).Length() > 10 {
				authorStr += " et al."
			}

			date := doc.Find(`meta[name="citation_date"]`).AttrOr("content", "")
			if date == "" {
				date = doc.Find(`meta[name="citation_publication_date"]`).AttrOr("content", "")
			}
			
			if date != "" {
				authorStr += " (" + date + ")"
			}

			if meta.Description != "" {
				meta.Description = authorStr + " • " + strings.TrimSpace(meta.Description)
			} else {
				meta.Description = authorStr
			}
		}
	}

	// Cleanup whitespace
	meta.Title = strings.TrimSpace(meta.Title)
	meta.Description = strings.TrimSpace(meta.Description)

	// Suppress bot-protection titles/descriptions
	lowerTitle := strings.ToLower(meta.Title)
	if strings.Contains(lowerTitle, "just a moment") || 
	   strings.Contains(lowerTitle, "checking your browser") ||
	   strings.Contains(lowerTitle, "access denied") ||
	   strings.Contains(lowerTitle, "attention required") ||
	   resp.StatusCode == 403 {
		meta.Title = meta.Domain
		meta.Description = "Metadata extraction restricted by " + meta.Domain
	}

	if meta.Title == "" {
		meta.Title = meta.Domain
	}

	return meta, nil
}

func extractDomain(fullURL string) string {
	parts := strings.Split(fullURL, "/")
	if len(parts) >= 3 {
		domain := parts[2]
		domain = strings.TrimPrefix(domain, "www.")
		return domain
	}
	return fullURL
}
