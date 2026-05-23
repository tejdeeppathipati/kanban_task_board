package models

import "time"

// Task represents a kanban board task.
type Task struct {
	ID          string     `json:"id"`
	UserID      string     `json:"user_id"`
	CreatedBy   string     `json:"created_by"`
	Scope       string     `json:"scope"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      string     `json:"status"`
	Priority    string     `json:"priority"`
	DueDate     *string    `json:"due_date"`
	Position    float64    `json:"position"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// CreateTaskRequest is the payload for creating a new task.
type CreateTaskRequest struct {
	UserID      string  `json:"user_id"`
	CreatedBy   string  `json:"created_by"`
	Scope       string  `json:"scope"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	DueDate     *string `json:"due_date"`
	Position    float64 `json:"position"`
}

// UpdateTaskRequest is the payload for updating an existing task.
type UpdateTaskRequest struct {
	Title       *string  `json:"title,omitempty"`
	Description *string  `json:"description,omitempty"`
	Status      *string  `json:"status,omitempty"`
	Priority    *string  `json:"priority,omitempty"`
	DueDate     *string  `json:"due_date,omitempty"`
	Position    *float64 `json:"position,omitempty"`
	Scope       *string  `json:"scope,omitempty"`
}

// Comment represents a comment on a task.
type Comment struct {
	ID        string    `json:"id"`
	TaskID    string    `json:"task_id"`
	UserID    string    `json:"user_id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateCommentRequest is the payload for creating a comment.
type CreateCommentRequest struct {
	Body string `json:"body"`
}

// ActivityEvent represents a task activity entry.
type ActivityEvent struct {
	ID        string    `json:"id"`
	TaskID    string    `json:"task_id"`
	UserID    string    `json:"user_id"`
	EventType string    `json:"event_type"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
}

// TeamMember represents a workspace team member.
type TeamMember struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	AvatarURL *string   `json:"avatar_url"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateTeamMemberRequest is the payload for creating a team member.
type CreateTeamMemberRequest struct {
	UserID string `json:"user_id"`
	Name   string `json:"name"`
	Color  string `json:"color"`
}

// Label represents a workspace label.
type Label struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateLabelRequest is the payload for creating a label.
type CreateLabelRequest struct {
	UserID string `json:"user_id"`
	Name   string `json:"name"`
	Color  string `json:"color"`
}

// TaskAssignee represents a task-team member assignment.
type TaskAssignee struct {
	TaskID    string    `json:"task_id"`
	MemberID  string    `json:"member_id"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// TaskLabel represents a task-label assignment.
type TaskLabel struct {
	TaskID    string    `json:"task_id"`
	LabelID   string    `json:"label_id"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// ErrorResponse is a standard API error payload.
type ErrorResponse struct {
	Error   string `json:"error"`
	Details string `json:"details,omitempty"`
}
