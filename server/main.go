package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/tejdeeppathipati/task-board-server/config"
	"github.com/tejdeeppathipati/task-board-server/db"
	"github.com/tejdeeppathipati/task-board-server/handlers"
	"github.com/tejdeeppathipati/task-board-server/middleware"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Configuration error: %v", err)
	}

	ctx := context.Background()

	pool, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Database connection error: %v", err)
	}
	defer pool.Close()

	// Initialise handlers with the shared database pool.
	taskHandler := &handlers.TaskHandler{DB: pool}
	commentHandler := &handlers.CommentHandler{DB: pool}
	activityHandler := &handlers.ActivityHandler{DB: pool}
	teamHandler := &handlers.TeamMemberHandler{DB: pool}
	labelHandler := &handlers.LabelHandler{DB: pool}

	r := chi.NewRouter()

	// Global middleware stack.
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Timeout(30 * time.Second))
	r.Use(middleware.CORS(cfg.AllowedOrigins))

	// Public health check endpoint.
	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`)) //nolint:errcheck
	})

	// Protected API routes — all require a valid Supabase JWT.
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg.SupabaseJWTSecret))

		// Tasks
		r.Get("/api/tasks", taskHandler.List)
		r.Post("/api/tasks", taskHandler.Create)
		r.Patch("/api/tasks/{id}", taskHandler.Update)
		r.Delete("/api/tasks/{id}", taskHandler.Delete)

		// Comments
		r.Get("/api/tasks/{id}/comments", commentHandler.List)
		r.Post("/api/tasks/{id}/comments", commentHandler.Create)

		// Activity
		r.Get("/api/tasks/{id}/activity", activityHandler.List)

		// Team Members
		r.Get("/api/team-members", teamHandler.List)
		r.Post("/api/team-members", teamHandler.Create)

		// Labels
		r.Get("/api/labels", labelHandler.List)
		r.Post("/api/labels", labelHandler.Create)
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine so we can handle graceful shutdown.
	go func() {
		log.Printf("Task Board API server listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Wait for interrupt signal for graceful shutdown.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
