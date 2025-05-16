package models

import "time"

type Event struct {
	EventName     string                 `json:"eventName"`
	VideoID       string                 `json:"videoId"`
	Timestamp     string                 `json:"timestamp"`
	SessionID     string                 `json:"sessionId"`
	UserID        string                 `json:"userId"`
	AnonymousID   string                 `json:"anonymousId"`
	PlaybackState map[string]interface{} `json:"playbackState"`
	Technical     map[string]interface{} `json:"technical"`
	Context       map[string]interface{} `json:"context"`
	CustomData    string                 `json:"customData,omitempty"`
}

type EventBatch struct {
	ClientID  string  `json:"clientId"`
	APIKey    string  `json:"apiKey"`
	SessionID string  `json:"sessionId"`
	BatchID   string  `json:"batchId"`
	Events    []Event `json:"events"`
	Timestamp string  `json:"timestamp"`
	IsRetry   bool    `json:"isRetry,omitempty"`
}

func NewEventBatch(clientID, apiKey, sessionID, batchID string, events []Event) EventBatch {
	return EventBatch{
		ClientID:  clientID,
		APIKey:    apiKey,
		SessionID: sessionID,
		BatchID:   batchID,
		Events:    events,
		Timestamp: time.Now().Format(time.RFC3339),
	}
}
