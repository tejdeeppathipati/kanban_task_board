package handlers

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/tejdeeppathipati/task-board-server/db"
	"github.com/tejdeeppathipati/task-board-server/middleware"
	"github.com/tejdeeppathipati/task-board-server/models"
)

// ActivityHandler handles task activity log operations.
type ActivityHandler struct {
	DB *db.Pool
}

// List returns all activity events for a task.
// GET /api/tasks/{id}/activity
func (h *ActivityHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	taskID := chi.URLParam(r, "id")

	var events []models.ActivityEvent

	err := h.DB.WithRLS(r.Context(), userID, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT id, task_id, user_id, event_type, message, created_at
			FROM activity_events
			WHERE task_id = $1
			ORDER BY created_at DESC
		`, taskID)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var e models.ActivityEvent
			if err := rows.Scan(&e.ID, &e.TaskID, &e.UserID, &e.EventType,
				&e.Message, &e.CreatedAt); err != nil {
				return err
			}
			events = append(events, e)
		}
		return rows.Err()
	})

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch activity", err.Error())
		return
	}

	if events == nil {
		events = []models.ActivityEvent{}
	}
	writeJSON(w, http.StatusOK, events)
}
