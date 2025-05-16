package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/adtyap26/event-stream-video/internal/api"
	"github.com/adtyap26/event-stream-video/internal/logger"
)

func main() {
	// Create event logger
	eventLogger, err := logger.NewEventLogger()
	if err != nil {
		log.Fatalf("Failed to create event logger: %v", err)
	}
	defer eventLogger.Close()

	// Set up API routes with the event logger
	router := api.SetupRoutes(eventLogger)

	// Start server
	port := 8080
	log.Printf("Starting server on http://localhost:%d", port)
	log.Printf("Test page available at http://localhost:%d/index.html", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), router); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
