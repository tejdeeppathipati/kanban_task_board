package config

import (
	"fmt"
	"os"
	"strings"
)

// Config holds all configuration values loaded from environment variables.
type Config struct {
	Port             string
	DatabaseURL      string
	SupabaseJWTSecret string
	AllowedOrigins   []string
}

// Load reads configuration from environment variables and returns a Config.
// It returns an error if any required variable is missing.
func Load() (*Config, error) {
	dbURL := os.Getenv("SUPABASE_DB_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("SUPABASE_DB_URL is required")
	}

	jwtSecret := os.Getenv("SUPABASE_JWT_SECRET")
	if jwtSecret == "" {
		return nil, fmt.Errorf("SUPABASE_JWT_SECRET is required")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	origins := os.Getenv("ALLOWED_ORIGINS")
	if origins == "" {
		origins = "http://localhost:5173"
	}

	return &Config{
		Port:             port,
		DatabaseURL:      dbURL,
		SupabaseJWTSecret: jwtSecret,
		AllowedOrigins:   strings.Split(origins, ","),
	}, nil
}
