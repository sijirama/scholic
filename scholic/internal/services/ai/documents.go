package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/generative-ai-go/genai"
)

const (
	defaultDocumentModel = "gemini-2.5-flash"
	defaultHTTPTimeout   = 90 * time.Second
)

type DocumentMetadata struct {
	Title          string   `json:"title"`
	Authors        []string `json:"authors"`
	PublishedYear  *int     `json:"publishedYear"`
	Description    string   `json:"description"`
	Tags           []string `json:"tags"`
	Publisher      string   `json:"publisher"`
	PageCount      int      `json:"pageCount"`
	MetadataSource string   `json:"metadataSource"`
}

func ExtractDocumentMetadata(ctx context.Context, pdfURL, fileName string) (DocumentMetadata, error) {
	if !IsGeminiAvailable() {
		meta := fallbackMetadata(fileName)
		meta.MetadataSource = "fallback"
		return meta, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pdfURL, nil)
	if err != nil {
		return DocumentMetadata{}, err
	}
	resp, err := httpClient().Do(req)
	if err != nil {
		return DocumentMetadata{}, fmt.Errorf("fetch pdf: %w", err)
	}
	defer resp.Body.Close()

	pdfBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return DocumentMetadata{}, fmt.Errorf("read pdf: %w", err)
	}

	prompt := strings.TrimSpace(`
Analyze this uploaded academic PDF and infer clean metadata.
Return JSON only with this exact shape:
{
  "title": string,
  "authors": string[],
  "publishedYear": number|null,
  "description": string,
  "tags": string[],
  "publisher": string,
  "pageCount": number
}

Rules:
- Prefer the PDF's actual title, not the filename.
- Authors should be person names only.
- Description should be 1-3 concise sentences.
- Tags should be 3-8 short topical tags.
- If unsure, use null for publishedYear and empty strings/arrays where appropriate.
- Do not wrap the JSON in markdown.
`)

	model := GetGeminiClient().GenerativeModel(getDocumentModel())
	response, err := model.GenerateContent(ctx,
		genai.Blob{MIMEType: "application/pdf", Data: pdfBytes},
		genai.Text(prompt),
	)
	if err != nil {
		return DocumentMetadata{}, fmt.Errorf("gemini document metadata: %w", err)
	}
	if len(response.Candidates) == 0 || len(response.Candidates[0].Content.Parts) == 0 {
		return DocumentMetadata{}, fmt.Errorf("empty response from gemini")
	}

	text := fmt.Sprintf("%v", response.Candidates[0].Content.Parts[0])
	text = stripJSONFences(text)

	var meta DocumentMetadata
	if err := json.Unmarshal([]byte(text), &meta); err != nil {
		return DocumentMetadata{}, fmt.Errorf("parse gemini document metadata: %w (raw: %s)", err, text)
	}
	meta.normalize()
	meta.MetadataSource = "ai"
	if meta.Title == "" {
		fallback := fallbackMetadata(fileName)
		meta.Title = fallback.Title
	}
	return meta, nil
}

func GenerateEmbedding(ctx context.Context, text string) ([]float64, error) {
	text = strings.TrimSpace(text)
	if text == "" || !IsGeminiAvailable() {
		return nil, nil
	}

	em := GetGeminiClient().EmbeddingModel("gemini-embedding-001")
	var lastErr error
	for attempt := 0; attempt < 5; attempt++ {
		if attempt > 0 {
			wait := time.Duration(1<<uint(attempt)) * time.Second
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(wait):
			}
		}

		res, err := em.EmbedContent(ctx, genai.Text(text))
		if err == nil {
			values := make([]float64, len(res.Embedding.Values))
			for i, value := range res.Embedding.Values {
				values[i] = float64(value)
			}
			return values, nil
		}
		lastErr = err
		if !strings.Contains(err.Error(), "429") {
			break
		}
	}
	return nil, fmt.Errorf("gemini embed: %w", lastErr)
}

func BuildSearchText(meta DocumentMetadata) string {
	parts := []string{
		meta.Title,
		strings.Join(meta.Authors, ", "),
		meta.Description,
		strings.Join(meta.Tags, ", "),
		meta.Publisher,
	}
	if meta.PublishedYear != nil {
		parts = append(parts, strconv.Itoa(*meta.PublishedYear))
	}
	if meta.PageCount > 0 {
		parts = append(parts, fmt.Sprintf("%d pages", meta.PageCount))
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

func fallbackMetadata(fileName string) DocumentMetadata {
	base := strings.TrimSuffix(fileName, regexp.MustCompile(`\.[^.]+$`).FindString(fileName))
	base = strings.ReplaceAll(base, "_", " ")
	base = strings.ReplaceAll(base, "-", " ")
	base = regexp.MustCompile(`\s+`).ReplaceAllString(strings.TrimSpace(base), " ")
	words := strings.Fields(base)
	for i, word := range words {
		if word == strings.ToUpper(word) && len(word) > 3 {
			continue
		}
		words[i] = strings.Title(strings.ToLower(word))
	}

	var yearPtr *int
	if year := regexp.MustCompile(`\b(19|20)\d{2}\b`).FindString(base); year != "" {
		if parsed, err := strconv.Atoi(year); err == nil {
			yearPtr = &parsed
		}
	}

	return DocumentMetadata{
		Title:          strings.Join(words, " "),
		Authors:        []string{},
		PublishedYear:  yearPtr,
		Description:    "",
		Tags:           []string{},
		Publisher:      "",
		PageCount:      0,
		MetadataSource: "fallback",
	}
}

func stripJSONFences(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```json") {
		s = strings.TrimPrefix(s, "```json")
	} else if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```")
	}
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

func (m *DocumentMetadata) normalize() {
	m.Title = strings.TrimSpace(m.Title)
	m.Description = strings.TrimSpace(m.Description)
	m.Publisher = strings.TrimSpace(m.Publisher)
	m.Authors = dedupeTrimmed(m.Authors)
	m.Tags = dedupeTrimmed(m.Tags)
	if m.PageCount < 0 {
		m.PageCount = 0
	}
}

func dedupeTrimmed(values []string) []string {
	seen := make(map[string]bool, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func getDocumentModel() string {
	if model := strings.TrimSpace(os.Getenv("GEMINI_DOCUMENT_MODEL")); model != "" {
		return model
	}
	return defaultDocumentModel
}

func httpClient() *http.Client {
	return &http.Client{Timeout: defaultHTTPTimeout}
}
