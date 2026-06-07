const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const MinecraftBot = require('./bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, 'config.json');

// Global state
let config = {
  host: 'dynamic-8.magmanode.com',
  port: 25752,
  username: 'MagmaAFK',
  auth: 'offline',
  version: false,
  reconnectDelay: 10000,
  afk: {
    enabled: true,
    randomWalk: true,
    randomLook: true,
    autoJump: true,
    swingArm: true,
    chatSpam: false,
    chatMessages: ["Server is online!", "Staying active!"],
    chatInterval: 600000
  }
};

// Load config from file if exists
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      config = JSON.parse(data);
      console.log('Successfully loaded config.json.');
    } else {
      saveConfig(config);
    }
  } catch (err) {
    console.error('Error loading config.json:', err);
  }
}

function saveConfig(newConfig) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf8');
    config = newConfig;
    console.log('Successfully saved config.json.');
    return true;
  } catch (err) {
    console.error('Error saving config.json:', err);
    return false;
  }
}

// Initialize config
loadConfig();

// Instantiate bot
const mcBot = new MinecraftBot(config);

// Circular logs buffer (store last 150 log entries to show new clients)
const logsBuffer = [];
const MAX_LOGS = 150;
let lastStatus = { online: false, connecting: false, controlMode: 'auto' };
let lastStatusUpdate = {
  ping: 0,
  position: { x: 0, y: 0, z: 0 },
  health: 20,
  food: 20,
  players: []
};

// Listen to bot events
mcBot.on('log', (logData) => {
  logsBuffer.push(logData);
  if (logsBuffer.length > MAX_LOGS) {
    logsBuffer.shift();
  }
  io.emit('log', logData);
});

mcBot.on('status', (statusData) => {
  lastStatus = { ...lastStatus, ...statusData };
  // Merge coordinates/ping from status data if available
  if (statusData.online) {
    lastStatusUpdate.ping = statusData.ping;
    lastStatusUpdate.position = statusData.position;
  }
  io.emit('status', lastStatus);
});

mcBot.on('status_update', (updateData) => {
  lastStatusUpdate = { ...lastStatusUpdate, ...updateData };
  io.emit('status_update', lastStatusUpdate);
});

mcBot.on('chat', (chatData) => {
  io.emit('chat_received', chatData);
});

mcBot.on('control_mode', (modeData) => {
  lastStatus.controlMode = modeData.mode;
  io.emit('control_mode', modeData);
});

mcBot.on('hotbar_slot', (slotData) => {
  io.emit('hotbar_slot', slotData);
});

// Express routes
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO signaling
io.on('connection', (socket) => {
  console.log(`Web client connected: ${socket.id}`);

  // Send current state immediately to the newly connected browser
  socket.emit('init', {
    config,
    status: lastStatus,
    statusUpdate: lastStatusUpdate,
    logs: logsBuffer
  });

  // Handle manual dashboard controls
  socket.emit('log', {
    timestamp: new Date().toLocaleTimeString(),
    message: 'Dashboard client connected.',
    type: 'system'
  });

  socket.on('start_bot', () => {
    if (!lastStatus.online && !lastStatus.connecting) {
      mcBot.connect();
    }
  });

  socket.on('stop_bot', () => {
    if (lastStatus.online || lastStatus.connecting) {
      mcBot.disconnect();
    }
  });

  socket.on('restart_bot', () => {
    mcBot.disconnect();
    setTimeout(() => {
      mcBot.connect();
    }, 1000);
  });

  socket.on('send_chat', (message) => {
    mcBot.sendChat(message);
  });

  socket.on('manual_action', (actionName) => {
    mcBot.triggerManualAction(actionName);
  });

  socket.on('set_control_mode', (mode) => {
    mcBot.setControlMode(mode);
  });

  socket.on('select_hotbar', (slot) => {
    mcBot.selectHotbarSlot(slot);
  });

  socket.on('move_bot', (data) => {
    if (mcBot.bot) {
      mcBot.bot.setControlState(data.direction, data.state);
    }
  });

  socket.on('look_bot', (data) => {
    if (mcBot.bot) {
      mcBot.bot.look(data.yaw, data.pitch, false);
    }
  });

  socket.on('click_bot', (data) => {
    if (mcBot.bot) {
      const block = mcBot.bot.blockAtCursor(4);
      if (data.button === 2) {
        // Right Click: interact / bed
        if (block) {
          mcBot.bot.activateBlock(block, (err) => {
            if (err) {
              mcBot.log(`Failed to interact with ${block.name}: ${err.message}`, 'error');
            } else {
              mcBot.log(`Interacted with block: ${block.name} at ${block.position}`, 'success');
            }
          });
        } else {
          mcBot.log("Right click: No block in range (4 blocks max)", "warning");
        }
      } else if (data.button === 0) {
        // Left Click: attack / dig / swing
        if (block) {
          mcBot.bot.dig(block, false, (err) => {
            if (err) {
              mcBot.log(`Failed to break block: ${err.message}`, 'error');
            } else {
              mcBot.log(`Broke block: ${block.name} at ${block.position}`, 'success');
            }
          });
        } else {
          mcBot.bot.swingArm('right');
        }
      }
    }
  });

  socket.on('save_config', (newConfig) => {
    const success = saveConfig(newConfig);
    if (success) {
      mcBot.updateConfig(newConfig);
      socket.emit('config_saved', { success: true, config });
      mcBot.log('Settings updated from the web panel.', 'system');
      
      // If server or username changed while bot is active, prompt restart or auto-restart
      // To keep it simple, we just apply the AFK modifications instantly. If the connection details changed, they take effect on the next reconnect/restart.
    } else {
      socket.emit('config_saved', { success: false, message: 'Failed to write config file.' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Web client disconnected: ${socket.id}`);
  });
});

// Server start
server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`MagmaNode AFK Bot Web Dashboard is live!`);
  console.log(`Open in your browser: http://localhost:${PORT}`);
  console.log(`==================================================`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  mcBot.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  mcBot.disconnect();
  process.exit(0);
});
