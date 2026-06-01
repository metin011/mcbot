document.addEventListener('DOMContentLoaded', () => {
  // Initialize Socket.IO connection
  const socket = io();

  // DOM Elements
  const connectionBadge = document.getElementById('connection-badge');
  const badgeText = document.getElementById('badge-text');
  
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnRestart = document.getElementById('btn-restart');
  
  const valPing = document.getElementById('val-ping');
  const valCoords = document.getElementById('val-coords');
  const valVitals = document.getElementById('val-vitals');
  const valPlayers = document.getElementById('val-players');
  
  const consoleLogs = document.getElementById('console-logs');
  const btnClearConsole = document.getElementById('btn-clear-console');
  const btnAutoscroll = document.getElementById('btn-autoscroll');
  
  const chatInput = document.getElementById('chat-input');
  const btnSendChat = document.getElementById('btn-send-chat');
  
  const manualButtons = document.querySelectorAll('.action-btn');
  
  // Form Config Elements
  const configForm = document.getElementById('config-form');
  const inputHost = document.getElementById('host');
  const inputPort = document.getElementById('port');
  const inputUsername = document.getElementById('username');
  const selectAuth = document.getElementById('auth');
  const selectVersion = document.getElementById('version');
  const inputReconnectDelay = document.getElementById('reconnectDelay');
  
  const checkAfkEnabled = document.getElementById('afk-enabled');
  const afkSubSettings = document.getElementById('afk-sub-settings');
  const checkRandomWalk = document.getElementById('afk-randomWalk');
  const checkRandomLook = document.getElementById('afk-randomLook');
  const checkAutoJump = document.getElementById('afk-autoJump');
  const checkSwingArm = document.getElementById('afk-swingArm');
  
  const checkChatSpam = document.getElementById('afk-chatSpam');
  const chatSpamConfig = document.getElementById('chat-spam-config');
  const inputChatInterval = document.getElementById('afk-chatInterval');
  const textChatMessages = document.getElementById('afk-chatMessages');
  
  const footerTime = document.getElementById('footer-time');

  // Application State
  let autoscrollActive = true;
  let isBotOnline = false;
  let isBotConnecting = false;

  // Update Footer Time
  function updateTime() {
    footerTime.textContent = new Date().toLocaleTimeString();
  }
  updateTime();
  setInterval(updateTime, 1000);

  // ==========================================================================
  // AFK FIELD DISPLAY TOGGLES
  // ==========================================================================
  checkAfkEnabled.addEventListener('change', () => {
    if (checkAfkEnabled.checked) {
      afkSubSettings.style.opacity = '1';
      afkSubSettings.style.pointerEvents = 'all';
    } else {
      afkSubSettings.style.opacity = '0.4';
      afkSubSettings.style.pointerEvents = 'none';
    }
  });

  checkChatSpam.addEventListener('change', () => {
    if (checkChatSpam.checked) {
      chatSpamConfig.style.display = 'flex';
    } else {
      chatSpamConfig.style.display = 'none';
    }
  });

  // ==========================================================================
  // CONSOLE UTILITIES
  // ==========================================================================
  btnClearConsole.addEventListener('click', () => {
    consoleLogs.innerHTML = '';
    appendLogMessage({
      timestamp: new Date().toLocaleTimeString(),
      message: 'Console logs cleared by user.',
      type: 'system'
    });
  });

  btnAutoscroll.addEventListener('click', () => {
    autoscrollActive = !autoscrollActive;
    btnAutoscroll.classList.toggle('active', autoscrollActive);
  });

  function appendLogMessage(log) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${log.type || 'info'}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${log.timestamp}]`;
    
    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-msg';
    msgSpan.textContent = log.message;
    
    entry.appendChild(timeSpan);
    entry.appendChild(msgSpan);
    consoleLogs.appendChild(entry);
    
    // Maintain maximum 1000 console entries for performance
    if (consoleLogs.children.length > 1000) {
      consoleLogs.removeChild(consoleLogs.firstChild);
    }
    
    if (autoscrollActive) {
      consoleLogs.scrollTop = consoleLogs.scrollHeight;
    }
  }

  // ==========================================================================
  // WEB INTERACTIVE BUTTON TRIGGERS
  // ==========================================================================
  btnStart.addEventListener('click', () => {
    socket.emit('start_bot');
  });

  btnStop.addEventListener('click', () => {
    socket.emit('stop_bot');
  });

  btnRestart.addEventListener('click', () => {
    socket.emit('restart_bot');
  });

  // Chat message sending
  function sendMessage() {
    const msg = chatInput.value.trim();
    if (msg) {
      socket.emit('send_chat', msg);
      chatInput.value = '';
    }
  }

  btnSendChat.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  // Manual movement/action triggers
  manualButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      if (action) {
        socket.emit('manual_action', action);
      }
    });
  });

  // ==========================================================================
  // CONFIGURATION SUBMISSION
  // ==========================================================================
  configForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const chatMessagesArr = textChatMessages.value
      .split('\n')
      .map(m => m.trim())
      .filter(m => m.length > 0);

    const configPayload = {
      host: inputHost.value.trim(),
      port: parseInt(inputPort.value) || 25565,
      username: inputUsername.value.trim(),
      auth: selectAuth.value,
      version: selectVersion.value || false,
      reconnectDelay: parseInt(inputReconnectDelay.value) || 10000,
      afk: {
        enabled: checkAfkEnabled.checked,
        randomWalk: checkRandomWalk.checked,
        randomLook: checkRandomLook.checked,
        autoJump: checkAutoJump.checked,
        swingArm: checkSwingArm.checked,
        chatSpam: checkChatSpam.checked,
        chatMessages: chatMessagesArr,
        chatInterval: (parseInt(inputChatInterval.value) || 600) * 1000 // Convert sec to ms
      }
    };

    socket.emit('save_config', configPayload);
  });

  // ==========================================================================
  // SOCKET.IO REALTIME EVENTS
  // ==========================================================================
  
  // Connection initialization
  socket.on('init', (data) => {
    // Fill Config Fields
    inputHost.value = data.config.host || '';
    inputPort.value = data.config.port || 25565;
    inputUsername.value = data.config.username || 'MagmaAFK';
    selectAuth.value = data.config.auth || 'offline';
    selectVersion.value = data.config.version || '';
    inputReconnectDelay.value = data.config.reconnectDelay || 10000;
    
    checkAfkEnabled.checked = data.config.afk?.enabled ?? true;
    checkRandomWalk.checked = data.config.afk?.randomWalk ?? true;
    checkRandomLook.checked = data.config.afk?.randomLook ?? true;
    checkAutoJump.checked = data.config.afk?.autoJump ?? true;
    checkSwingArm.checked = data.config.afk?.swingArm ?? true;
    
    checkChatSpam.checked = data.config.afk?.chatSpam ?? false;
    inputChatInterval.value = (data.config.afk?.chatInterval || 600000) / 1000;
    textChatMessages.value = data.config.afk?.chatMessages?.join('\n') || '';

    // Trigger visual updates for sub-settings
    checkAfkEnabled.dispatchEvent(new Event('change'));
    checkChatSpam.dispatchEvent(new Event('change'));

    // Populate Console Logs
    consoleLogs.innerHTML = '';
    if (data.logs && data.logs.length > 0) {
      data.logs.forEach(appendLogMessage);
    } else {
      appendLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: 'Panel successfully synchronized with Minecraft server wrapper.',
        type: 'success'
      });
    }

    // Load initial states
    updateConnectionStatus(data.status);
    updateStatusDetails(data.statusUpdate);
  });

  // Logs stream
  socket.on('log', (logData) => {
    appendLogMessage(logData);
  });

  // Connection State Updates
  socket.on('status', (statusData) => {
    updateConnectionStatus(statusData);
  });

  // Vitals and coordinates updates
  socket.on('status_update', (updateData) => {
    updateStatusDetails(updateData);
  });

  socket.on('config_saved', (result) => {
    if (result.success) {
      appendLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: 'Configuration successfully written to config.json and loaded!',
        type: 'success'
      });
      alert('Settings saved and applied successfully!');
    } else {
      appendLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: `Failed to save configuration: ${result.message}`,
        type: 'error'
      });
      alert(`Error saving settings: ${result.message}`);
    }
  });

  // Helper: Update badge and buttons state
  function updateConnectionStatus(status) {
    isBotOnline = status.online;
    isBotConnecting = status.connecting;

    // Reset styles
    connectionBadge.className = 'badge';
    
    if (isBotOnline) {
      connectionBadge.classList.add('badge-online');
      badgeText.textContent = 'Online';
      
      btnStart.disabled = true;
      btnStop.disabled = false;
      btnRestart.disabled = false;
      
      chatInput.disabled = false;
      btnSendChat.disabled = false;
      
      manualButtons.forEach(btn => btn.disabled = false);
    } else if (isBotConnecting) {
      connectionBadge.classList.add('badge-connecting');
      badgeText.textContent = 'Connecting';
      
      btnStart.disabled = true;
      btnStop.disabled = false;
      btnRestart.disabled = true;
      
      chatInput.disabled = true;
      btnSendChat.disabled = true;
      
      manualButtons.forEach(btn => btn.disabled = true);
    } else {
      connectionBadge.classList.add('badge-offline');
      badgeText.textContent = 'Offline';
      
      btnStart.disabled = false;
      btnStop.disabled = true;
      btnRestart.disabled = true;
      
      chatInput.disabled = true;
      btnSendChat.disabled = true;
      
      manualButtons.forEach(btn => btn.disabled = true);
      
      // Reset displays
      valPing.textContent = '-- ms';
      valCoords.textContent = 'X: - Y: - Z: -';
      valVitals.textContent = '-- / --';
      valPlayers.textContent = '0 online';
    }
  }

  // Helper: Update live numbers (HP, position, players)
  function updateStatusDetails(details) {
    if (!isBotOnline) return;

    if (details.ping !== undefined) {
      valPing.textContent = `${details.ping} ms`;
    }

    if (details.position) {
      const x = Math.round(details.position.x);
      const y = Math.round(details.position.y);
      const z = Math.round(details.position.z);
      valCoords.textContent = `X: ${x} Y: ${y} Z: ${z}`;
    }

    if (details.health !== undefined && details.food !== undefined) {
      valVitals.textContent = `${Math.round(details.health)} HP / ${Math.round(details.food)} FP`;
    }

    if (details.players) {
      const count = details.players.length;
      valPlayers.textContent = `${count} online`;
      valPlayers.title = details.players.join(', ');
    }
  }
});
