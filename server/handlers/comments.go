package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/tejdeeppathipati/task-board-server/db"
	"github.com/tejdeeppathipati/task-board-server/middleware"
	"github.com/tejdeeppathipati/task-board-server/models"
)

// CommentHandler handles task comment operations.
type CommentHandler struct {
	DB *db.Pool
}

// List returns all comments for a task.
// GET /api/tasks/{id}/comments
func (h *CommentHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	taskID := chi.URLParam(r, "id")

	var comments []models.Comment

	err := h.DB.WithRLS(r.Context(), userID, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT id, task_id, user_id, body, created_at
			FROM comments
			WHERE task_id = $1
			ORDER BY created_at ASC
		`, taskID)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var c models.Comment
			if err := rows.Scan(&c.ID, &c.TaskID, &c.UserID, &c.Body, &c.CreatedAt); err != nil {
				return err
			}
			comments = append(comments, c)
		}
		return rows.Err()
	})

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch comments", err.Error())
		return
	}

	if comments == nil {
		comments = []models.Comment{}
	}
	writeJSON(w, http.StatusOK, comments)
}

// Create adds a comment to a task.
// POST /api/tasks/{id}/comments
func (h *CommentHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	taskID := chi.URLParam(r, "id")

	var req models.CreateCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	body := strings.TrimSpace(req.Body)
	if body == "" || len(body) > 1200 {
		writeError(w, http.StatusBadRequest, "Comment body is required and must be 1–1200 characters", "")
		return
	}

	var comment models.Comment

	err := h.DB.WithRLS(r.Context(), userID, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			INSERT INTO comments (task_id, user_id, body)
			VALUES ($1, $2, $3)
			RETURNING id, task_id, user_id, body, created_at
		`, taskID, userID, body).Scan(
			&comment.ID, &comment.TaskID, &comment.UserID, &comment.Body, &comment.CreatedAt,
		)
	})

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create comment", err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, comment)
}
