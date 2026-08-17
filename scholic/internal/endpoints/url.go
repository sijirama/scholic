package endpoints

import (
	"net/url"
	"strings"
)

func canonicalAnnotationURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return stripQueryAndFragment(raw)
	}

	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	if isYouTubeWatchURL(u) {
		videoID := u.Query().Get("v")
		u.RawQuery = ""
		if videoID != "" {
			q := url.Values{}
			q.Set("v", videoID)
			u.RawQuery = q.Encode()
		}
	} else {
		u.RawQuery = ""
	}
	u.ForceQuery = false
	u.Fragment = ""
	if len(u.Path) > 1 {
		u.Path = strings.TrimRight(u.Path, "/")
	}
	return u.String()
}

func stripQueryAndFragment(raw string) string {
	raw = strings.TrimSpace(raw)
	if i := strings.IndexAny(raw, "?#"); i >= 0 {
		return raw[:i]
	}
	return raw
}

func isYouTubeWatchURL(u *url.URL) bool {
	host := strings.ToLower(u.Hostname())
	return (host == "youtube.com" || strings.HasSuffix(host, ".youtube.com")) && u.Path == "/watch"
}
