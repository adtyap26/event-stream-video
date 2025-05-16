package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/adtyap26/event-stream-video/internal/logger"
	"github.com/adtyap26/event-stream-video/internal/models"
)

type EventHandler struct {
	logger *logger.EventLogger
}

func NewEventHandler(logger *logger.EventLogger) *EventHandler {
	return &EventHandler{
		logger: logger,
	}
}

func (h *EventHandler) HandleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var batch models.EventBatch
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&batch); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return

	}

	if err := h.logger.LogBatch(batch); err != nil {
		log.Printf("Error logging batch: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Log to console
	log.Printf("Received batch with %d events from client %s (Session: %s)",
		len(batch.Events), batch.ClientID, batch.SessionID)

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{
		"status":  "success",
		"message": fmt.Sprintf("Processed %d events", len(batch.Events)),
	})
}

// HandleBeacons processes beacon event batches (no response)
func (h *EventHandler) HandleBeacons(w http.ResponseWriter, r *http.Request) {
	// Only accept POST requests
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse the request body
	var batch models.EventBatch
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&batch); err != nil {
		log.Printf("Error decoding beacon: %v", err)
		return
	}

	// Log the batch
	if err := h.logger.LogBatch(batch); err != nil {
		log.Printf("Error logging beacon batch: %v", err)
		return
	}

	// Log to console
	log.Printf("Received beacon with %d events from client %s (Session: %s)",
		len(batch.Events), batch.ClientID, batch.SessionID)

	// Return 204 No Content for beacons
	w.WriteHeader(http.StatusNoContent)
}
