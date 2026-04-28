(function () {
  const DEFAULTS = {
    sessionName: "ha-entity-sync",
    sessionPassword: "ha-entity-sync",
    pollIntervalMs: 3000,
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeEntityDefinition(definition) {
    return {
      entityId: definition.entityId,
      name: definition.name || definition.entityId,
      kind: definition.kind || "toggle",
      writable: definition.writable !== false,
      domain: definition.domain || definition.entityId.split(".")[0],
      serviceOn: definition.serviceOn || null,
      serviceOff: definition.serviceOff || null,
    };
  }

  function normalizeStateValue(rawState, kind) {
    if (kind === "toggle") {
      return rawState === "on";
    }
    if (kind === "number") {
      const parsed = Number(rawState);
      return Number.isNaN(parsed) ? rawState : parsed;
    }
    return rawState;
  }

  function displayStateValue(value, kind) {
    if (kind === "toggle") {
      return value ? "On" : "Off";
    }
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    return String(value);
  }

  function serviceForRequest(entity) {
    if (entity.serviceOn && entity.serviceOff) {
      return {
        on: entity.serviceOn,
        off: entity.serviceOff,
      };
    }

    switch (entity.domain) {
      case "light":
      case "switch":
      case "input_boolean":
        return {
          on: `${entity.domain}/turn_on`,
          off: `${entity.domain}/turn_off`,
        };
      default:
        return null;
    }
  }

  function publicConfig() {
    return window.APP_CONFIG || {};
  }

  function entitySyncConfig() {
    const config = window.ENTITY_SYNC_CONFIG || {};
    return {
      sessionName: config.sessionName || DEFAULTS.sessionName,
      sessionPassword: config.sessionPassword || DEFAULTS.sessionPassword,
      haUrl: config.haUrl || "",
      haToken: config.haToken || "",
      pollIntervalMs: config.pollIntervalMs || DEFAULTS.pollIntervalMs,
      entities: Array.isArray(config.entities) ? config.entities : [],
    };
  }

  class EntitySyncModel extends Multisynq.Model {
    init() {
      this.entityDefinitions = {};
      this.entityStates = {};
      this.commandLog = {};
      this.bridgeStatus = {
        connected: false,
        bridgeViewId: null,
        lastSeenAt: null,
        error: null,
      };

      this.subscribe(this.id, "registerEntityDefinitions", "registerEntityDefinitions");
      this.subscribe(this.id, "reportEntityState", "reportEntityState");
      this.subscribe(this.id, "requestEntityChange", "requestEntityChange");
      this.subscribe(this.id, "markCommandStatus", "markCommandStatus");
      this.subscribe(this.id, "setBridgeStatus", "setBridgeStatus");
    }

    registerEntityDefinitions(payload) {
      const nextDefinitions = {};
      (payload.definitions || []).forEach((definition) => {
        const normalized = normalizeEntityDefinition(definition);
        nextDefinitions[normalized.entityId] = normalized;

        if (!this.entityStates[normalized.entityId]) {
          this.entityStates[normalized.entityId] = {
            entityId: normalized.entityId,
            name: normalized.name,
            kind: normalized.kind,
            writable: normalized.writable,
            value: null,
            rawState: null,
            available: false,
            lastUpdatedAt: null,
            pendingCommandId: null,
            pendingRequestedValue: null,
            lastError: null,
          };
        }
      });

      this.entityDefinitions = nextDefinitions;
      this.publish(this.id, "model-updated");
    }

    reportEntityState(payload) {
      const definition = this.entityDefinitions[payload.entityId];
      if (!definition) return;

      const current = this.entityStates[payload.entityId] || {};
      this.entityStates[payload.entityId] = {
        ...current,
        entityId: payload.entityId,
        name: definition.name,
        kind: definition.kind,
        writable: definition.writable,
        value: payload.value,
        rawState: payload.rawState,
        available: payload.available !== false,
        lastUpdatedAt: payload.lastUpdatedAt || nowIso(),
        lastError: payload.lastError || null,
      };
      this.publish(this.id, "model-updated");
    }

    requestEntityChange(payload) {
      const definition = this.entityDefinitions[payload.entityId];
      if (!definition || !definition.writable) return;

      const requestId = payload.requestId;
      const existing = this.commandLog[requestId];
      if (existing) return;

      this.commandLog[requestId] = {
        requestId,
        entityId: payload.entityId,
        requestedValue: payload.requestedValue,
        requestedBy: payload.requestedBy || "unknown",
        createdAt: payload.createdAt || nowIso(),
        status: "pending",
        error: null,
      };

      const state = this.entityStates[payload.entityId];
      if (state) {
        state.pendingCommandId = requestId;
        state.pendingRequestedValue = payload.requestedValue;
        state.lastError = null;
      }

      this.publish(this.id, "model-updated");
    }

    markCommandStatus(payload) {
      const command = this.commandLog[payload.requestId];
      if (!command) return;

      command.status = payload.status;
      command.updatedAt = payload.updatedAt || nowIso();
      command.error = payload.error || null;

      const state = this.entityStates[command.entityId];
      if (state) {
        if (payload.status === "done" || payload.status === "failed") {
          state.pendingCommandId = null;
          state.pendingRequestedValue = null;
        }
        state.lastError = payload.status === "failed" ? payload.error || "Unknown error" : null;
      }

      this.publish(this.id, "model-updated");
    }

    setBridgeStatus(payload) {
      this.bridgeStatus = {
        connected: !!payload.connected,
        bridgeViewId: payload.bridgeViewId || null,
        lastSeenAt: payload.lastSeenAt || nowIso(),
        error: payload.error || null,
      };
      this.publish(this.id, "model-updated");
    }
  }

  EntitySyncModel.register("EntitySyncModel");

  class BaseView extends Multisynq.View {
    constructor(model) {
      super(model);
      this.model = model;
      this.subscribe(this.model.id, "model-updated", () => this.render());
    }

    entityList() {
      return Object.values(this.model.entityStates).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    }
  }

  class BridgeView extends BaseView {
    constructor(model) {
      super(model);
      this.config = entitySyncConfig();
      this.haHeaders = {
        Authorization: `Bearer ${this.config.haToken}`,
        "Content-Type": "application/json",
      };
      this.processedRequests = new Set();
      this.dom = {
        bridgeStatus: document.getElementById("bridge-status"),
        bridgeMeta: document.getElementById("bridge-meta"),
        entityList: document.getElementById("bridge-entity-list"),
        log: document.getElementById("bridge-log"),
      };

      this.publish(this.model.id, "registerEntityDefinitions", {
        definitions: this.config.entities,
      });

      this.publish(this.model.id, "setBridgeStatus", {
        connected: true,
        bridgeViewId: this.viewId,
        lastSeenAt: nowIso(),
        error: null,
      });

      this.log("Bridge connected to Multisynq session.");
      this.render();
      this.startPolling();
      this.startHeartbeat();
      this.checkCommandQueue();
    }

    destroy() {
      clearInterval(this.pollTimer);
      clearInterval(this.heartbeatTimer);
      this.publish(this.model.id, "setBridgeStatus", {
        connected: false,
        bridgeViewId: null,
        lastSeenAt: nowIso(),
        error: "Bridge disconnected",
      });
      super.destroy();
    }

    startPolling() {
      this.refreshAllStates();
      this.pollTimer = setInterval(
        () => this.refreshAllStates(),
        this.config.pollIntervalMs
      );
    }

    startHeartbeat() {
      this.heartbeatTimer = setInterval(() => {
        this.publish(this.model.id, "setBridgeStatus", {
          connected: true,
          bridgeViewId: this.viewId,
          lastSeenAt: nowIso(),
          error: null,
        });
        this.checkCommandQueue();
      }, 1500);
    }

    async refreshAllStates() {
      for (const definition of this.config.entities) {
        await this.refreshEntityState(normalizeEntityDefinition(definition));
      }
    }

    async refreshEntityState(entity) {
      try {
        const response = await fetch(
          `${this.config.haUrl}/api/states/${entity.entityId}`,
          {
            headers: this.haHeaders,
          }
        );

        if (!response.ok) {
          throw new Error(`State fetch failed with ${response.status}`);
        }

        const data = await response.json();
        this.publish(this.model.id, "reportEntityState", {
          entityId: entity.entityId,
          value: normalizeStateValue(data.state, entity.kind),
          rawState: data.state,
          available: true,
          lastUpdatedAt: nowIso(),
          lastError: null,
        });
      } catch (error) {
        this.publish(this.model.id, "reportEntityState", {
          entityId: entity.entityId,
          value: null,
          rawState: null,
          available: false,
          lastUpdatedAt: nowIso(),
          lastError: error.message,
        });
        this.log(`State refresh failed for ${entity.entityId}: ${error.message}`);
      }
    }

    checkCommandQueue() {
      Object.values(this.model.commandLog)
        .filter((command) => command.status === "pending")
        .forEach((command) => {
          if (this.processedRequests.has(command.requestId)) return;
          this.processedRequests.add(command.requestId);
          this.executeCommand(command);
        });
    }

    async executeCommand(command) {
      const entity = this.model.entityDefinitions[command.entityId];
      if (!entity) return;

      const services = serviceForRequest(entity);
      if (!services) {
        this.publish(this.model.id, "markCommandStatus", {
          requestId: command.requestId,
          status: "failed",
          error: `No service mapping for domain ${entity.domain}`,
          updatedAt: nowIso(),
        });
        return;
      }

      const servicePath = command.requestedValue ? services.on : services.off;

      try {
        this.publish(this.model.id, "markCommandStatus", {
          requestId: command.requestId,
          status: "processing",
          updatedAt: nowIso(),
        });

        const response = await fetch(`${this.config.haUrl}/api/services/${servicePath}`, {
          method: "POST",
          headers: this.haHeaders,
          body: JSON.stringify({
            entity_id: command.entityId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Service call failed with ${response.status}`);
        }

        await this.refreshEntityState(entity);
        this.publish(this.model.id, "markCommandStatus", {
          requestId: command.requestId,
          status: "done",
          updatedAt: nowIso(),
        });
        this.log(
          `Applied ${displayStateValue(command.requestedValue, entity.kind)} to ${command.entityId}.`
        );
      } catch (error) {
        this.publish(this.model.id, "markCommandStatus", {
          requestId: command.requestId,
          status: "failed",
          error: error.message,
          updatedAt: nowIso(),
        });
        this.log(`Command failed for ${command.entityId}: ${error.message}`);
      }
    }

    log(message) {
      if (!this.dom.log) return;
      const line = `[${new Date().toLocaleTimeString()}] ${message}`;
      this.dom.log.textContent = `${line}\n${this.dom.log.textContent}`.trim();
    }

    render() {
      if (this.dom.bridgeStatus) {
        this.dom.bridgeStatus.textContent = this.model.bridgeStatus.connected
          ? "Bridge online"
          : "Bridge offline";
      }

      if (this.dom.bridgeMeta) {
        this.dom.bridgeMeta.textContent = `Session: ${this.config.sessionName} | Entities: ${this.entityList().length}`;
      }

      if (!this.dom.entityList) return;

      const cards = this.entityList()
        .map((entity) => {
          const command = entity.pendingCommandId
            ? this.model.commandLog[entity.pendingCommandId]
            : null;
          return `
            <article class="card">
              <h3>${entity.name}</h3>
              <p><strong>${entity.entityId}</strong></p>
              <p>Value: ${displayStateValue(entity.value, entity.kind)}</p>
              <p>Available: ${entity.available ? "Yes" : "No"}</p>
              <p>Pending: ${command ? command.status : "No"}</p>
              <p>Error: ${entity.lastError || "-"}</p>
            </article>
          `;
        })
        .join("");

      this.dom.entityList.innerHTML =
        cards || '<p class="empty">No entities configured yet.</p>';
    }
  }

  class PublicView extends BaseView {
    constructor(model) {
      super(model);
      this.dom = {
        bridgeStatus: document.getElementById("public-bridge-status"),
        entityList: document.getElementById("public-entity-list"),
        sessionMeta: document.getElementById("session-meta"),
      };
      this.render();
    }

    requestToggle(entity) {
      const nextValue = !entity.value;
      this.publish(this.model.id, "requestEntityChange", {
        requestId: `${this.viewId}-${Date.now()}-${entity.entityId}`,
        entityId: entity.entityId,
        requestedValue: nextValue,
        requestedBy: this.viewId,
        createdAt: nowIso(),
      });
    }

    render() {
      if (this.dom.bridgeStatus) {
        this.dom.bridgeStatus.textContent = this.model.bridgeStatus.connected
          ? `Bridge online, last seen ${this.model.bridgeStatus.lastSeenAt}`
          : "Bridge offline. Commands will not be applied until the local bridge rejoins.";
      }

      if (this.dom.sessionMeta) {
        this.dom.sessionMeta.textContent = `Session: ${window.EntitySyncCurrentSessionName || "Unknown"}`;
      }

      if (!this.dom.entityList) return;

      const cards = this.entityList()
        .map((entity) => {
          const disabled =
            !entity.writable || entity.kind !== "toggle" || !this.model.bridgeStatus.connected;
          const command = entity.pendingCommandId
            ? this.model.commandLog[entity.pendingCommandId]
            : null;

          return `
            <article class="card">
              <div class="card-head">
                <div>
                  <h3>${entity.name}</h3>
                  <p class="muted">${entity.entityId}</p>
                </div>
                <span class="pill ${entity.value ? "on" : "off"}">
                  ${displayStateValue(entity.value, entity.kind)}
                </span>
              </div>
              <p>Available: ${entity.available ? "Yes" : "No"}</p>
              <p>Pending: ${command ? command.status : "No"}</p>
              <p>Error: ${entity.lastError || "-"}</p>
              <button data-entity-id="${entity.entityId}" ${disabled ? "disabled" : ""}>
                Toggle
              </button>
            </article>
          `;
        })
        .join("");

      this.dom.entityList.innerHTML =
        cards || '<p class="empty">Waiting for the local bridge to publish entities.</p>';

      this.dom.entityList.querySelectorAll("button[data-entity-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const entity = this.model.entityStates[button.dataset.entityId];
          if (entity) this.requestToggle(entity);
        });
      });
    }
  }

  function assertAppConfig() {
    if (!publicConfig().API_KEY || !publicConfig().APP_ID) {
      throw new Error("config.js must define APP_CONFIG.API_KEY and APP_CONFIG.APP_ID.");
    }
  }

  async function joinBridgeSession() {
    assertAppConfig();
    const config = entitySyncConfig();
    if (!config.haUrl || !config.haToken) {
      throw new Error(
        "entity-config.js must define ENTITY_SYNC_CONFIG.haUrl and haToken for the bridge."
      );
    }

    return Multisynq.Session.join({
      apiKey: publicConfig().API_KEY,
      appId: publicConfig().APP_ID,
      name: config.sessionName,
      password: config.sessionPassword,
      model: EntitySyncModel,
      view: BridgeView,
      viewData: { mode: "bridge" },
    });
  }

  async function joinPublicSession(sessionName, password) {
    assertAppConfig();
    window.EntitySyncCurrentSessionName = sessionName;
    return Multisynq.Session.join({
      apiKey: publicConfig().API_KEY,
      appId: publicConfig().APP_ID,
      name: sessionName,
      password,
      model: EntitySyncModel,
      view: PublicView,
      viewData: { mode: "public" },
    });
  }

  window.EntitySyncApp = {
    DEFAULTS,
    displayStateValue,
    entitySyncConfig,
    joinBridgeSession,
    joinPublicSession,
    normalizeEntityDefinition,
  };
})();
