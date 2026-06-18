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

// TeamMemberHandler handles team member operations.
type TeamMemberHandler struct {
	DB *db.Pool
}

// List returns all team members for a workspace.
// GET /api/team-members?workspace_id=<uuid>
func (h *TeamMemberHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	workspaceID := r.URL.Query().Get("workspace_id")
	if workspaceID == "" {
		workspaceID = userID
	}

	var members []models.TeamMember

	err := h.DB.WithRLS(r.Context(), userID, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT id, user_id, name, role, color, avatar_url, created_at
			FROM team_members
			WHERE user_id = $1
			ORDER BY created_at ASC
		`, workspaceID)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var m models.TeamMember
			if err := rows.Scan(&m.ID, &m.UserID, &m.Name, &m.Role, &m.Color,
				&m.AvatarURL, &m.CreatedAt); err != nil {
				return err
			}
			members = append(members, m)
		}
		return rows.Err()
	})

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch team members", err.Error())
		return
	}

	if members == nil {
		members = []models.TeamMember{}
	}
	writeJSON(w, http.StatusOK, members)
}

// Create adds a new team member.
// POST /api/team-members
func (h *TeamMemberHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req models.CreateTeamMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 80 {
		writeError(w, http.StatusBadRequest, "Name is required and must be 1–80 characters", "")
		return
	}

	if req.UserID == "" {
		req.UserID = userID
	}
	if req.Role == "" {
		req.Role = "member"
	}

	var member models.TeamMember

	err := h.DB.WithRLS(r.Context(), userID, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			INSERT INTO team_members (user_id, name, role, color)
			VALUES ($1, $2, $3, $4)
			RETURNING id, user_id, name, role, color, avatar_url, created_at
		`, req.UserID, name, req.Role, req.Color).Scan(
			&member.ID, &member.UserID, &member.Name, &member.Role, &member.Color,
			&member.AvatarURL, &member.CreatedAt,
		)
	})

	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create team member", err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, member)
}
