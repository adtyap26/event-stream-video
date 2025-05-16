package logger

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/adtyap26/event-stream-video/internal/models"
)

type EventLogger struct {
	logFile *os.File
	logDir  string
}

func NewEventLogger() (*EventLogger, error) {
	return NewEventLoggerWithDir("logs")
}

func NewEventLoggerWithDir(logDir string) (*EventLogger, error) {
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("Failed to create log: %w", err)
	}

	timestamp := time.Now().Format("2006-01-02-15-04-05")
	logPath := filepath.Join(logDir, fmt.Sprintf("events-%s.log", timestamp))

	logFile, err := os.Create(logPath)
	if err != nil {
		return nil, fmt.Errorf("Failed to create log file: %w", err)
	}

	return &EventLogger{
		logFile: logFile,
		logDir:  logDir,
	}, nil
}

func (l *EventLogger) logEvent(event models.Event) error {
	eventJSON, err := json.MarshalIndent(event, "", " ")
	if err != nil {
		return fmt.Errorf("Failed to marshal event: %w, err")
	}

	_, err = l.logFile.Write(eventJSON)
	if err != nil {
		return fmt.Errorf("Failed to write event JSON: %w", err)
	}

	_, err = l.logFile.WriteString("\n\n")
	if err != nil {
		return fmt.Errorf("Failed to write line breaks: %w", err)
	}
	return nil
}

func (l *EventLogger) LogBatch(batch models.EventBatch) error {
	batchInfo := fmt.Sprintf("--- Batch from client %s (Session: %s, Batch: %s) ---\n",
		batch.ClientID, batch.SessionID, batch.BatchID)

	_, err := l.logFile.WriteString(batchInfo)
	if err != nil {
		return fmt.Errorf("failed to write batch header: %w", err)
	}

	for _, event := range batch.Events {
		if err := l.logEvent(event); err != nil {
			return err
		}
	}

	return nil
}

// Close closes the log file
func (l *EventLogger) Close() error {
	return l.logFile.Close()
}
