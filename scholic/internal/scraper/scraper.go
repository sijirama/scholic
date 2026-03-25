package scraper

import (
	"bytes"
	"crypto/tls"
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

	// Create an HTTP client that ignores SSL errors and timeouts quickly
	customTransport := http.DefaultTransport.(*http.Transport).Clone()
	customTransport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}

	client := &http.Client{
		Timeout:   8 * time.Second,
		Transport: customTransport,
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ScholicLinkPreviewBot/1.0")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

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
