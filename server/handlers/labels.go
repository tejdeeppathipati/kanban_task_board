package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/tejdeeppathipati/task-board-server/db"
	"github.com/tejdeeppathipati/task-board-server/middleware"
	"github.com/tejdeeppathipati/task-board-server/models"
)

// LabelHandler handles label operations.
type LabelHandler struct {
	DB *db.Pool
}

// List returns all labels for a workspace.
// GET /api/labels?workspace_id=<uuid>
func (h *LabelHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	workspaceID := r.URL.Query().Get("workspace_id")
	if workspaceID == "" {
		workspaceID = userID
	}

	var labels []models.Label

	err := h.DB.WithRLS(r.Context(), userID, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT id, user_id, name, color, created_at
			FROM labels
			WHERE user_id = $1
			ORDER BY name ASC
		`, workspaceID)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var l models.Label
			if err := rows.Scan(&l.ID, &l.UserID, &l.Name, &l.Color, &l.CreatedAt); err != nil {
				return err
			}
			labels = append(labels, l)
		}
		return rows.Err()
	})

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch labels", err.Error())
		return
	}

	if labels == nil {
		labels = []models.Label{}
	}
	writeJSON(w, http.StatusOK, labels)
}

// Create adds a new label.
// POST /api/labels
func (h *LabelHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req models.CreateLabelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 40 {
		writeError(w, http.StatusBadRequest, "Name is required and must be 1–40 characters", "")
		return
	}

	if req.UserID == "" {
		req.UserID = userID
	}

	var label models.Label

	err := h.DB.WithRLS(r.Context(), userID, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			INSERT INTO labels (user_id, name, color)
			VALUES ($1, $2, $3)
			RETURNING id, user_id, name, color, created_at
		`, req.UserID, name, req.Color).Scan(
			&label.ID, &label.UserID, &label.Name, &label.Color, &label.CreatedAt,
		)
	})

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create label", err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, label)
}
