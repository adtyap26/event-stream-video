package api

import (
	"net/http"

	"github.com/adtyap26/event-stream-video/internal/logger"
)

func SetupRoutes(eventLogger *logger.EventLogger) http.Handler {
	eventHandler := NewEventHandler(eventLogger)

	mux := http.NewServeMux()

	mux.Handle("/api/v1/events", CORSMiddleware(http.HandlerFunc(eventHandler.HandleEvents)))
	mux.Handle("/api/v1/events/beacon", CORSMiddleware(http.HandlerFunc(eventHandler.HandleBeacons)))

	// Serve static files
	fs := http.FileServer(http.Dir("./"))
	mux.Handle("/", fs)

	return mux
}
