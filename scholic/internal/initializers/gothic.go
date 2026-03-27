package initializers

import (
	"os"

	"github.com/gorilla/sessions"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"github.com/markbates/goth/providers/google"
)

func InitGothic() {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		panic("SESSION_SECRET environment variable is required")
	}

	// Initialize the session store for Gothic
	store := sessions.NewCookieStore([]byte(secret))
	store.MaxAge(86400 * 30) // 30 days
	store.Options.Path = "/"
	store.Options.HttpOnly = true
	store.Options.Secure = os.Getenv("ENV") == "production"
	gothic.Store = store

	goth.UseProviders(
		google.New(
			os.Getenv("GOOGLE_CLIENT_ID"),
			os.Getenv("GOOGLE_CLIENT_SECRET"),
			os.Getenv("GOOGLE_CALLBACK_URL"),
		),
	)
}
