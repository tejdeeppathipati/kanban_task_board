package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/tejdeeppathipati/task-board-server/models"
)

// writeJSON encodes the given value as JSON and writes it to the response.
func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

// writeError writes a standardized error response.
func writeError(w http.ResponseWriter, status int, message, details string) {
	writeJSON(w, status, models.ErrorResponse{
		Error:   message,
		Details: details,
	})
}
