package scraper

import (
	"crypto/tls"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type LinkMetadata struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Image       string `json:"image"`
	Favicon     string `json:"favicon"`
	Domain      string `json:"domain"`
}

var (
	titleRegex       = regexp.MustCompile(`(?i)<title.*?>(.*?)</title>`)
	ogTitleRegex     = regexp.MustCompile(`(?i)<meta\s+property=["']og:title["']\s+content=["'](.*?)["']\s*/>`)
	ogTitleRegexAlt  = regexp.MustCompile(`(?i)<meta\s+content=["'](.*?)["']\s+property=["']og:title["']\s*/>`)
	ogDescRegex      = regexp.MustCompile(`(?i)<meta\s+property=["']og:description["']\s+content=["'](.*?)["']\s*/>`)
	ogDescRegexAlt   = regexp.MustCompile(`(?i)<meta\s+name=["']description["']\s+content=["'](.*?)["']\s*/>`)
	ogImageRegex     = regexp.MustCompile(`(?i)<meta\s+property=["']og:image["']\s+content=["'](.*?)["']\s*/>`)
	ogImageRegexAlt  = regexp.MustCompile(`(?i)<meta\s+content=["'](.*?)["']\s+property=["']og:image["']\s*/>`)
	faviconRegex     = regexp.MustCompile(`(?i)<link\s+rel=["'][^"']*icon["']\s+href=["'](.*?)["']`)

	githubStarRegex     = regexp.MustCompile(`(?i)id=["']repo-stars-counter-star["'][^>]*title=["']([^"']+)["']`)
	citationAuthorRegex = regexp.MustCompile(`(?is)<meta[^>]*name=["']citation_author["'][^>]*content=["']([^"']+)["']|<meta[^>]*content=["']([^"']+)["'][^>]*name=["']citation_author["']`)
	citationDateRegex   = regexp.MustCompile(`(?is)<meta[^>]*name=["']citation_date["'][^>]*content=["']([^"']+)["']|<meta[^>]*content=["']([^"']+)["'][^>]*name=["']citation_date["']`)
)

// ExtractMetadata fetches a URL and extracts OpenGraph and basic HTML metadata.
func ExtractMetadata(url string) (*LinkMetadata, error) {
	// Attempt to resolve PDF URLs to their HTML abstract equivalents
	if strings.Contains(url, "arxiv.org/pdf/") {
		url = strings.Replace(url, "/pdf/", "/abs/", 1)
		url = strings.TrimSuffix(url, ".pdf")
	} else if strings.Contains(url, "pubmed.ncbi.nlm.nih.gov") && strings.HasSuffix(url, ".pdf") {
		url = strings.TrimSuffix(url, ".pdf") // Very naive fallback
	}

	// Create an HTTP client that ignores SSL errors and timeouts quickly
	customTransport := http.DefaultTransport.(*http.Transport).Clone()
	customTransport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	
	client := &http.Client{
		Timeout:   5 * time.Second,
		Transport: customTransport,
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	// Add user agent to avoid basic blocks
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ScholicLinkPreviewBot/1.0")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Read up to 50KB to avoid downloading giant files or streams, metadata is usually in the head
	limitReader := io.LimitReader(resp.Body, 50*1024)
	bodyBytes, err := io.ReadAll(limitReader)
	if err != nil && err != io.EOF {
		return nil, err
	}

	// Fast fail if this is actually a PDF binary (starts with %PDF)
	if len(bodyBytes) > 4 && string(bodyBytes[:4]) == "%PDF" {
		domain := extractDomain(url)
		return &LinkMetadata{
			Domain: domain,
			Title:  "PDF Document",
			Description: "View PDF document hosted on " + domain,
		}, nil
	}

	html := string(bodyBytes)
	meta := &LinkMetadata{
		Domain: extractDomain(url),
	}

	// 1. Title (Prefer OG:Title over <title>)
	if match := ogTitleRegex.FindStringSubmatch(html); len(match) > 1 {
		meta.Title = match[1]
	} else if match := ogTitleRegexAlt.FindStringSubmatch(html); len(match) > 1 {
		meta.Title = match[1]
	} else if match := titleRegex.FindStringSubmatch(html); len(match) > 1 {
		meta.Title = match[1]
	}

	// 2. Description
	if match := ogDescRegex.FindStringSubmatch(html); len(match) > 1 {
		meta.Description = match[1]
	} else if match := ogDescRegexAlt.FindStringSubmatch(html); len(match) > 1 {
		meta.Description = match[1]
	}

	// 3. Image
	if match := ogImageRegex.FindStringSubmatch(html); len(match) > 1 {
		meta.Image = match[1]
	} else if match := ogImageRegexAlt.FindStringSubmatch(html); len(match) > 1 {
		meta.Image = match[1]
	}

	// 4. Favicon
	if match := faviconRegex.FindStringSubmatch(html); len(match) > 1 {
		favicon := match[1]
		if !strings.HasPrefix(favicon, "http") {
			// Resolve relative URL roughly
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
	// GitHub Stars
	if meta.Domain == "github.com" {
		if match := githubStarRegex.FindStringSubmatch(html); len(match) > 1 {
			stars := match[1]
			if meta.Description != "" {
				meta.Description = "⭐ " + stars + " • " + meta.Description
			} else {
				meta.Description = "⭐ " + stars
			}
		}
	}

	// Academic Authors and Dates (arXiv, PubMed, etc.)
	if meta.Domain == "arxiv.org" || meta.Domain == "pubmed.ncbi.nlm.nih.gov" || meta.Domain == "ncbi.nlm.nih.gov" {
		var authors []string
		matches := citationAuthorRegex.FindAllStringSubmatch(html, 10)
		for _, m := range matches {
			if m[1] != "" {
				authors = append(authors, m[1])
			} else if len(m) > 2 && m[2] != "" {
				authors = append(authors, m[2])
			}
		}

		if len(authors) > 0 {
			authorStr := "Authors: " + strings.Join(authors, ", ")
			if len(matches) == 10 {
				authorStr += " et al."
			}

			dateStr := ""
			// Only pull date for arxiv natively, pubmed uses different formats but sometimes matches
			if m := citationDateRegex.FindStringSubmatch(html); len(m) > 1 {
				if m[1] != "" {
					dateStr = m[1]
				} else if len(m) > 2 && m[2] != "" {
					dateStr = m[2]
				}
			}
			if dateStr != "" {
				authorStr += " (" + dateStr + ")"
			}

			if meta.Description != "" {
				meta.Description = authorStr + " • " + meta.Description
			} else {
				meta.Description = authorStr
			}
		}
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
