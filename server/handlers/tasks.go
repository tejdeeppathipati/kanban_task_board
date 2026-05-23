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

// TaskHandler handles task CRUD operations.
type TaskHandler struct {
	DB *db.Pool
}

// List returns all tasks for a workspace.
// GET /api/tasks?workspace_id=<uuid>
func (h *TaskHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	workspaceID := r.URL.Query().Get("workspace_id")
	if workspaceID == "" {
		workspaceID = userID
	}

	var tasks []models.Task

	err := h.DB.WithRLS(r.Context(), userID, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT id, user_id, created_by, scope, title, description, status, priority,
			       due_date::text, position, created_at, updated_at
			FROM tasks
			WHERE user_id = $1
			ORDER BY position ASC
		`, workspaceID)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var t models.Task
			if err := rows.Scan(&t.ID, &t.UserID, &t.CreatedBy, &t.Scope, &t.Title, &t.Description,
				&t.Status, &t.Priority, &t.DueDate, &t.Position,
				&t.CreatedAt, &t.UpdatedAt); err != nil {
				return err
			}
			tasks = append(tasks, t)
		}
		return rows.Err()
	})

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch tasks", err.Error())
		return
	}

	if tasks == nil {
		tasks = []models.Task{}
	}
	writeJSON(w, http.StatusOK, tasks)
}

// Create inserts a new task.
// POST /api/tasks
func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req models.CreateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	title := strings.TrimSpace(req.Title)
	if title == "" || len(title) > 160 {
		writeError(w, http.StatusBadRequest, "Title is required and must be 1–160 characters", "")
		return
	}

	if req.UserID == "" {
		req.UserID = userID
	}
	req.CreatedBy = userID
	if req.Scope == "" {
		req.Scope = "personal"
	}

	var task models.Task

	err := h.DB.WithRLS(r.Context(), userID, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			INSERT INTO tasks (user_id, created_by, scope, title, description, status, priority, due_date, position)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9)
			RETURNING id, user_id, created_by, scope, title, description, status, priority,
			          due_date::text, position, created_at, updated_at
		`, req.UserID, req.CreatedBy, req.Scope, title, req.Description, req.Status, req.Priority,
			req.DueDate, req.Position).Scan(
			&task.ID, &task.UserID, &task.CreatedBy, &task.Scope, &task.Title, &task.Description,
			&task.Status, &task.Priority, &task.DueDate, &task.Position,
			&task.CreatedAt, &task.UpdatedAt,
		)
	})

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create task", err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, task)
}

// Update patches an existing task.
// PATCH /api/tasks/{id}
func (h *TaskHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	taskID := chi.URLParam(r, "id")

	var req models.UpdateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	var task models.Task

	err := h.DB.WithRLS(r.Context(), userID, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			UPDATE tasks SET
				title       = COALESCE($2, title),
				description = COALESCE($3, description),
				status      = COALESCE($4, status),
				priority    = COALESCE($5, priority),
				due_date    = COALESCE($6::date, due_date),
				position    = COALESCE($7, position),
				scope       = COALESCE($8, scope)
			WHERE id = $1
			RETURNING id, user_id, created_by, scope, title, description, status, priority,
			          due_date::text, position, created_at, updated_at
		`, taskID, req.Title, req.Description, req.Status, req.Priority,
			req.DueDate, req.Position, req.Scope).Scan(
			&task.ID, &task.UserID, &task.CreatedBy, &task.Scope, &task.Title, &task.Description,
			&task.Status, &task.Priority, &task.DueDate, &task.Position,
			&task.CreatedAt, &task.UpdatedAt,
		)
	})

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update task", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, task)
}

// Delete removes a task.
// DELETE /api/tasks/{id}
func (h *TaskHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	taskID := chi.URLParam(r, "id")

	err := h.DB.WithRLS(r.Context(), userID, func(ctx context.Context, tx pgx.Tx) error {
		result, err := tx.Exec(ctx, "DELETE FROM tasks WHERE id = $1", taskID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		return nil
	})

	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "Task not found", "")
			return
		}
		writeError(w, http.StatusInternalServerError, "Failed to delete task", err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
