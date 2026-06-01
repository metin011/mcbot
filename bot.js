const mineflayer = require('mineflayer');
const EventEmitter = require('events');

class MinecraftBot extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.bot = null;
    this.active = false;
    this.reconnectTimeout = null;
    this.afkInterval = null;
    this.chatSpamInterval = null;
    this.isReconnecting = false;
  }

  log(message, type = 'info') {
    const logData = {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    };
    this.emit('log', logData);
    console.log(`[${logData.timestamp}] [${type.toUpperCase()}] ${message}`);
  }

  connect() {
    if (this.bot) {
      this.disconnect();
    }

    this.active = true;
    this.isReconnecting = false;
    this.log(`Connecting to ${this.config.host}:${this.config.port || 25565}...`, 'system');

    const botOptions = {
      host: this.config.host,
      port: this.config.port || 25565,
      username: this.config.username,
      auth: this.config.auth || 'offline',
      physicsEnabled: false, // Turn off physics during handshake to prevent 1.21+ server kicks
      checkTimeoutInterval: 60000, // Increase timeouts to handle large 1.21.4 registry transfers
      closeTimeout: 60000
    };

    // If version is false or undefined, mineflayer will auto-detect
    if (this.config.version) {
      botOptions.version = this.config.version;
    }

    try {
      this.bot = mineflayer.createBot(botOptions);
      this.setupEventHandlers();
    } catch (err) {
      this.log(`Failed to create bot: ${err.message}`, 'error');
      this.handleReconnect();
    }
  }

  disconnect() {
    this.active = false;
    this.clearAFKIntervals();
    if (this.bot) {
      try {
        this.bot.quit();
      } catch (err) {
        // Already disconnected or failed to quit cleanly
      }
      this.bot = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.emit('status', { online: false, connecting: false });
    this.log('Bot disconnected manually.', 'system');
  }

  setupEventHandlers() {
    this.emit('status', { online: false, connecting: true });

    this.bot.on('inject_allowed', () => {
      this.log('Minecraft client loaded. Handshaking with server...', 'system');
    });

    this.bot.on('login', () => {
      this.log(`Successfully logged into server as '${this.bot.username}'!`, 'success');
    });

    this.bot.on('spawn', () => {
      this.bot.physicsEnabled = true; // Re-enable physics once spawned in world
      this.log('Bot spawned in the world.', 'success');
      this.emit('status', {
        online: true,
        connecting: false,
        username: this.bot.username,
        ping: this.bot.player.ping || 0,
        position: this.bot.entity?.position || { x: 0, y: 0, z: 0 }
      });

      this.startAFK();
      this.startChatSpam();

      // Start periodic updates for status dashboard (ping, health, coords)
      this.startPeriodicStatusUpdates();
    });

    this.bot.on('chat', (username, message) => {
      // Ignore own messages
      if (username === this.bot.username) return;
      this.log(`<${username}> ${message}`, 'chat');
      this.emit('chat', { username, message });
    });

    this.bot.on('kicked', (reason) => {
      const parsedReason = JSON.parse(reason);
      const message = parsedReason.text || parsedReason.extra?.map(e => e.text).join('') || reason;
      this.log(`Kicked from server. Reason: ${message}`, 'warning');
    });

    this.bot.on('end', () => {
      this.log('Connection closed.', 'system');
      this.clearAFKIntervals();
      this.emit('status', { online: false, connecting: false });
      
      if (this.active) {
        this.handleReconnect();
      }
    });

    this.bot.on('error', (err) => {
      this.log(`Error: ${err.message}`, 'error');
      // If error occurs and we are not ending yet, trigger reconnect
      if (this.active && !this.isReconnecting) {
        this.handleReconnect();
      }
    });
  }

  handleReconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    this.clearAFKIntervals();
    
    const delay = this.config.reconnectDelay || 10000;
    this.log(`Reconnecting in ${delay / 1000} seconds...`, 'system');
    this.emit('status', { online: false, connecting: true });

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  startPeriodicStatusUpdates() {
    if (this.statusUpdateTimer) clearInterval(this.statusUpdateTimer);
    
    this.statusUpdateTimer = setInterval(() => {
      if (!this.bot || !this.bot.entity) {
        clearInterval(this.statusUpdateTimer);
        return;
      }
      
      this.emit('status_update', {
        ping: this.bot.player?.ping || 0,
        position: this.bot.entity.position,
        health: this.bot.health || 20,
        food: this.bot.food || 20,
        players: Object.keys(this.bot.players)
      });
    }, 1000);
  }

  clearAFKIntervals() {
    if (this.afkInterval) {
      clearInterval(this.afkInterval);
      this.afkInterval = null;
    }
    if (this.chatSpamInterval) {
      clearInterval(this.chatSpamInterval);
      this.chatSpamInterval = null;
    }
    if (this.statusUpdateTimer) {
      clearInterval(this.statusUpdateTimer);
      this.statusUpdateTimer = null;
    }
  }

  startAFK() {
    if (this.afkInterval) clearInterval(this.afkInterval);
    if (!this.config.afk?.enabled) return;

    this.log('Anti-AFK module activated.', 'system');

    // Run AFK action every 8-15 seconds (randomized to look human)
    const runAfkLoop = () => {
      if (!this.bot || !this.bot.entity) return;

      const afkConfig = this.config.afk;
      const actions = [];

      if (afkConfig.randomLook) actions.push(this.actionLook.bind(this));
      if (afkConfig.autoJump) actions.push(this.actionJump.bind(this));
      if (afkConfig.swingArm) actions.push(this.actionSwingArm.bind(this));
      if (afkConfig.randomWalk) actions.push(this.actionWalk.bind(this));

      if (actions.length > 0) {
        // Choose 1 or 2 random actions to perform at this interval
        const numActions = Math.random() > 0.7 ? 2 : 1;
        for (let i = 0; i < numActions; i++) {
          const randomAction = actions[Math.floor(Math.random() * actions.length)];
          randomAction();
        }
      }

      // Schedule next action with randomized delay
      const nextDelay = Math.random() * 8000 + 7000; // 7 to 15 seconds
      if (this.bot && this.active) {
        this.afkInterval = setTimeout(runAfkLoop, nextDelay);
      }
    };

    // Start loop
    this.afkInterval = setTimeout(runAfkLoop, 5000);
  }

  startChatSpam() {
    if (this.chatSpamInterval) clearInterval(this.chatSpamInterval);
    
    const afkConfig = this.config.afk;
    if (!afkConfig?.enabled || !afkConfig.chatSpam || !afkConfig.chatMessages || afkConfig.chatMessages.length === 0) return;

    const interval = afkConfig.chatInterval || 600000; // default 10 minutes
    this.log(`Anti-AFK chat spam scheduled every ${interval / 60000} minutes.`, 'system');

    this.chatSpamInterval = setInterval(() => {
      if (!this.bot) return;
      const messages = afkConfig.chatMessages;
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      this.sendChat(randomMessage);
    }, interval);
  }

  // AFK Actions

  actionLook() {
    if (!this.bot) return;
    const yaw = Math.random() * Math.PI * 2 - Math.PI; // Full horizontal rotation
    const pitch = (Math.random() * Math.PI / 3) - (Math.PI / 6); // Up and down (-30 to 30 deg)
    
    // Look smoothly (3rd arg = false)
    this.bot.look(yaw, pitch, false, () => {
      this.log(`Bot looked to yaw: ${yaw.toFixed(2)}, pitch: ${pitch.toFixed(2)}`, 'afk');
    });
  }

  actionJump() {
    if (!this.bot) return;
    this.bot.setControlState('jump', true);
    setTimeout(() => {
      if (this.bot) this.bot.setControlState('jump', false);
    }, 200);
    this.log('Bot jumped in place.', 'afk');
  }

  actionSwingArm() {
    if (!this.bot) return;
    this.bot.swingArm('right');
    this.log('Bot swung arm.', 'afk');
  }

  actionWalk() {
    if (!this.bot) return;
    // Walk forward or backward randomly to stay close to the starting point
    const direction = Math.random() > 0.5 ? 'forward' : 'back';
    const duration = Math.random() * 500 + 300; // 300ms to 800ms to avoid falling off cliffs

    this.bot.setControlState(direction, true);
    this.log(`Bot started walking ${direction}.`, 'afk');

    setTimeout(() => {
      if (this.bot) {
        this.bot.setControlState(direction, false);
        this.log(`Bot stopped walking ${direction}.`, 'afk');
      }
    }, duration);
  }

  // Manual Trigger Methods from Dashboard

  triggerManualAction(actionName) {
    if (!this.bot) return false;
    
    switch (actionName) {
      case 'jump':
        this.actionJump();
        return true;
      case 'swing':
        this.actionSwingArm();
        return true;
      case 'look':
        this.actionLook();
        return true;
      case 'walk':
        this.actionWalk();
        return true;
      case 'sneak':
        this.bot.setControlState('sneak', true);
        this.log('Bot started sneaking.', 'system');
        setTimeout(() => {
          if (this.bot) {
            this.bot.setControlState('sneak', false);
            this.log('Bot stopped sneaking.', 'system');
          }
        }, 1000);
        return true;
      default:
        return false;
    }
  }

  sendChat(message) {
    if (!this.bot) {
      this.log('Cannot send chat: Bot is offline.', 'error');
      return false;
    }
    
    try {
      this.bot.chat(message);
      this.log(`Sent chat: ${message}`, 'chat-sent');
      return true;
    } catch (err) {
      this.log(`Failed to send chat: ${err.message}`, 'error');
      return false;
    }
  }

  updateConfig(newConfig) {
    this.config = newConfig;
    this.log('Configuration updated in-memory.', 'system');
    
    // If online and AFK configuration changed, reload intervals
    if (this.bot && this.bot.entity) {
      this.startAFK();
      this.startChatSpam();
    }
  }
}

module.exports = MinecraftBot;
