package endpoints

import "testing"

func TestCanonicalAnnotationURLStripsQueryAndFragment(t *testing.T) {
	got := canonicalAnnotationURL("https://Example.com/articles/post?utm_source=x&id=42#comments")
	want := "https://example.com/articles/post"
	if got != want {
		t.Fatalf("canonicalAnnotationURL() = %q, want %q", got, want)
	}
}

func TestCanonicalAnnotationURLKeepsRootSlash(t *testing.T) {
	got := canonicalAnnotationURL("https://example.com/?utm_source=x")
	want := "https://example.com/"
	if got != want {
		t.Fatalf("canonicalAnnotationURL() = %q, want %q", got, want)
	}
}

func TestCanonicalAnnotationURLTrimsTrailingPathSlash(t *testing.T) {
	got := canonicalAnnotationURL("https://example.com/articles/post/?ref=x")
	want := "https://example.com/articles/post"
	if got != want {
		t.Fatalf("canonicalAnnotationURL() = %q, want %q", got, want)
	}
}

func TestCanonicalAnnotationURLKeepsYouTubeVideoID(t *testing.T) {
	got := canonicalAnnotationURL("https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=x&list=abc#comments")
	want := "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
	if got != want {
		t.Fatalf("canonicalAnnotationURL() = %q, want %q", got, want)
	}
}

func TestCanonicalAnnotationURLFallback(t *testing.T) {
	got := canonicalAnnotationURL("not a url?utm_source=x#frag")
	want := "not a url"
	if got != want {
		t.Fatalf("canonicalAnnotationURL() = %q, want %q", got, want)
	}
}
