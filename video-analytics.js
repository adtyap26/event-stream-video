/**
 * Video Analytics SDK for Video.js
 * v1.0.0
 */
(function (window, document) {
  "use strict";

  // Configuration defaults
  const DEFAULT_CONFIG = {
    apiEndpoint: "http://localhost:8080/api/v1/events",
    batchSize: 15,
    batchInterval: 5000, // 5 seconds
    debug: false,
    clientId: null,
    apiKey: null,
    autoDetect: true,
    sampleRate: {
      timeupdate: 0.2, // Only send 20% of timeupdate events
    },
  };

  // SDK state
  let config = { ...DEFAULT_CONFIG };
  let eventQueue = [];
  let retryQueue = [];
  let retryAttempt = 0;
  let retryTimeout = null;
  let batchInterval = null;
  let trackedPlayers = new Map();
  let isInitialized = false;

  // Core SDK functionality
  const VideoAnalytics = {
    /**
     * Initialize the SDK
     * @param {string} clientId - Client identifier
     * @param {Object} options - Configuration options
     */
    init: function (clientId, options = {}) {
      if (isInitialized) {
        this.log("SDK already initialized");
        return;
      }

      // Merge configuration
      config = { ...DEFAULT_CONFIG, ...options, clientId };

      this.log("Initializing SDK with config:", config);

      // Validate required config
      if (!config.clientId) {
        console.error("VideoAnalytics: clientId is required");
        return;
      }

      // Set up batch interval
      batchInterval = setInterval(() => {
        this.sendBatch();
      }, config.batchInterval);

      // Set up page unload handler
      window.addEventListener("beforeunload", () => {
        this.handlePageUnload();
      });

      // Auto-detect Video.js players if enabled
      if (config.autoDetect) {
        this.detectPlayers();

        // Set up mutation observer to detect new players
        const observer = new MutationObserver((mutations) => {
          this.detectPlayers();
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }

      isInitialized = true;
      this.log("SDK initialized successfully");
    },

    /**
     * Track a specific Video.js player
     * @param {Object} player - Video.js player instance
     * @param {string} videoId - Identifier for the video
     */
    trackPlayer: function (player, videoId) {
      if (!player || typeof player.on !== "function") {
        console.error("VideoAnalytics: Invalid Video.js player instance");
        return;
      }

      if (trackedPlayers.has(player)) {
        this.log("Player already tracked");
        return;
      }

      this.log("Tracking player for video:", videoId);

      // Store player reference with video ID
      trackedPlayers.set(player, {
        videoId: videoId,
        lastTimeupdateTracked: 0,
      });

      // Register event listeners
      const events = [
        "play",
        "pause",
        "playing",
        "waiting",
        "seeking",
        "seeked",
        "ended",
        "loadstart",
        "loadedmetadata",
        "loadeddata",
        "canplay",
        "canplaythrough",
        "volumechange",
        "fullscreenchange",
        "error",
        "abort",
        "stalled",
        "suspend",
        "emptied",
        "ratechange",
        "durationchange",
        "progress",
      ];

      events.forEach((eventName) => {
        player.on(eventName, () => {
          this.trackEvent(player, eventName);
        });
      });

      // Handle timeupdate with sampling
      player.on("timeupdate", () => {
        const now = Date.now();
        const playerData = trackedPlayers.get(player);

        // Apply sampling and minimum interval (500ms)
        if (
          Math.random() < config.sampleRate.timeupdate &&
          now - playerData.lastTimeupdateTracked > 500
        ) {
          playerData.lastTimeupdateTracked = now;
          this.trackEvent(player, "timeupdate");
        }
      });

      // Track initial player state
      this.trackEvent(player, "playerInit");
    },

    /**
     * Auto-detect Video.js players on the page
     */
    detectPlayers: function () {
      if (typeof videojs === "undefined") {
        return;
      }

      // Find all video.js players
      const players = document.querySelectorAll(".video-js");
      players.forEach((element) => {
        const player = videojs.getPlayer(element);
        if (player && !trackedPlayers.has(player)) {
          // Try to find video ID from data attribute or generate one
          const videoId =
            element.dataset.videoId ||
            element.id ||
            "video-" + Math.random().toString(36).substring(2, 9);
          this.trackPlayer(player, videoId);
        }
      });
    },

    /**
     * Track a player event
     * @param {Object} player - Video.js player instance
     * @param {string} eventName - Name of the event
     */
    trackEvent: function (player, eventName) {
      if (!isInitialized) {
        console.error("VideoAnalytics: SDK not initialized");
        return;
      }

      const playerData = trackedPlayers.get(player);
      if (!playerData) {
        return;
      }

      const videoId = playerData.videoId;

      // Collect event data
      const event = {
        eventName: eventName,
        videoId: videoId,
        timestamp: new Date().toISOString(),
        sessionId: this.getSessionId(),
        ...this.getUserIdentifiers(),
        playbackState: {
          currentTime: player.currentTime(),
          duration: player.duration(),
          paused: player.paused(),
          ended: player.ended(),
          playbackRate: player.playbackRate(),
          volume: player.volume(),
          muted: player.muted(),
          fullscreen: player.isFullscreen ? player.isFullscreen() : false,
          networkState: player.networkState(),
          readyState: player.readyState(),
        },
        technical: {
          userAgent: navigator.userAgent,
          screenResolution: `${screen.width}x${screen.height}`,
          viewportSize: `${window.innerWidth}x${window.innerHeight}`,
          playerSize: `${player.currentWidth()}x${player.currentHeight()}`,
          connectionType: navigator.connection
            ? navigator.connection.effectiveType
            : null,
        },
        context: {
          pageUrl: window.location.href,
          referrer: document.referrer,
          pageTitle: document.title,
        },
      };

      this.log(`Tracked event: ${eventName}`, event);

      // Add to queue
      eventQueue.push(event);

      // Send immediately for certain events
      if (
        ["play", "pause", "ended", "error"].includes(eventName) ||
        eventQueue.length >= config.batchSize
      ) {
        this.sendBatch();
      }
    },

    /**
     * Send batched events to the server
     */
    sendBatch: function () {
      if (eventQueue.length === 0) return;

      const events = [...eventQueue];
      eventQueue = [];

      const payload = {
        clientId: config.clientId,
        apiKey: config.apiKey,
        sessionId: this.getSessionId(),
        batchId: this.generateUUID(),
        events: events,
        timestamp: new Date().toISOString(),
      };

      this.log(`Sending batch of ${events.length} events`);

      fetch(config.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Analytics-Client": "VideoAnalytics-SDK/1.0.0",
        },
        body: JSON.stringify(payload),
        keepalive: true,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          this.log("Batch sent successfully", data);
          retryAttempt = 0; // Reset retry counter on success
        })
        .catch((error) => {
          console.error("VideoAnalytics: Failed to send events", error);
          retryQueue.push(...events);
          this.scheduleRetry();
        });
    },

    /**
     * Handle page unload event
     */
    handlePageUnload: function () {
      // Clear batch interval
      if (batchInterval) {
        clearInterval(batchInterval);
      }

      // Combine queued events
      const allEvents = [...eventQueue, ...retryQueue];
      if (allEvents.length === 0) return;

      // Add a final event
      const finalEvent = {
        eventName: "pageUnload",
        timestamp: new Date().toISOString(),
        sessionId: this.getSessionId(),
        ...this.getUserIdentifiers(),
        context: {
          pageUrl: window.location.href,
          referrer: document.referrer,
        },
      };

      allEvents.push(finalEvent);

      // Use sendBeacon for more reliable delivery during page unload
      const payload = JSON.stringify({
        clientId: config.clientId,
        apiKey: config.apiKey,
        sessionId: this.getSessionId(),
        batchId: this.generateUUID(),
        events: allEvents,
        timestamp: new Date().toISOString(),
      });

      navigator.sendBeacon(config.apiEndpoint + "/beacon", payload);
      this.log(`Sent ${allEvents.length} events via beacon`);
    },

    /**
     * Schedule retry for failed transmissions
     */
    scheduleRetry: function () {
      if (retryTimeout) return; // Already scheduled

      retryAttempt++;
      const delay = Math.min(1000 * Math.pow(2, retryAttempt), 30000); // Max 30 seconds

      this.log(`Scheduling retry attempt ${retryAttempt} in ${delay}ms`);

      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        this.attemptRetry();
      }, delay);
    },

    /**
     * Attempt to retry sending failed events
     */
    attemptRetry: function () {
      if (retryQueue.length === 0) return;

      this.log(`Retrying to send ${retryQueue.length} events`);

      const events = [...retryQueue];
      retryQueue = [];

      const payload = {
        clientId: config.clientId,
        apiKey: config.apiKey,
        sessionId: this.getSessionId(),
        batchId: this.generateUUID(),
        events: events,
        timestamp: new Date().toISOString(),
        isRetry: true,
        retryAttempt: retryAttempt,
      };

      fetch(config.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Analytics-Client": "VideoAnalytics-SDK/1.0.0",
          "X-Retry-Attempt": retryAttempt.toString(),
        },
        body: JSON.stringify(payload),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          this.log("Retry successful", data);
          retryAttempt = 0; // Reset retry counter
        })
        .catch((error) => {
          console.error("VideoAnalytics: Retry failed", error);

          // Give up after 5 attempts
          if (retryAttempt >= 5) {
            this.log("Max retry attempts reached, discarding events");
            retryAttempt = 0;
            return;
          }

          // Put events back in retry queue
          retryQueue.push(...events);
          this.scheduleRetry();
        });
    },

    /**
     * Get or create session ID
     * @returns {string} Session ID
     */
    getSessionId: function () {
      let sessionId = sessionStorage.getItem("video_analytics_session_id");
      if (!sessionId) {
        sessionId = this.generateUUID();
        sessionStorage.setItem("video_analytics_session_id", sessionId);
      }
      return sessionId;
    },

    /**
     * Get user identifiers
     * @returns {Object} User identifiers
     */
    getUserIdentifiers: function () {
      // Get or create anonymous ID
      let anonymousId = localStorage.getItem("video_analytics_user_id");
      if (!anonymousId) {
        anonymousId = this.generateUUID();
        localStorage.setItem("video_analytics_user_id", anonymousId);
      }

      // Get authenticated ID if available from your app
      const userId = window.currentUser?.id || null;

      return { userId, anonymousId };
    },

    /**
     * Generate a UUID v4
     * @returns {string} UUID
     */
    generateUUID: function () {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        },
      );
    },

    /**
     * Log debug messages
     */
    log: function (...args) {
      if (config.debug) {
        console.log("VideoAnalytics:", ...args);
      }
    },
  };

  // Expose the SDK globally
  window.VideoAnalytics = VideoAnalytics;
})(window, document);
