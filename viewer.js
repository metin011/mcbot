const EventEmitter = require('events');
const { Server } = require('socket.io');
const { WorldView } = require('prismarine-viewer/viewer');
const { setupRoutes } = require('prismarine-viewer/lib/common');

const VIEWER_PREFIX = '/viewer';

class ViewerManager {
  constructor(app, httpServer) {
    setupRoutes(app, VIEWER_PREFIX);
    this.io = new Server(httpServer, {
      path: `${VIEWER_PREFIX}/socket.io`,
      cors: { origin: '*' }
    });
    this.bot = null;
    this.sockets = [];
    this.primitives = {};
    this.socketCleanups = new Map();

    this.io.on('connection', (socket) => this.onConnection(socket));
  }

  attachBot(bot, { viewDistance = 8, firstPerson = true } = {}) {
    this.detachBot();
    this.bot = bot;
    this.viewDistance = viewDistance;
    this.firstPerson = firstPerson;

    bot.viewer = new EventEmitter();

    bot.viewer.erase = (id) => {
      delete this.primitives[id];
      for (const socket of this.sockets) {
        socket.emit('primitive', { id });
      }
    };

    bot.viewer.drawBoxGrid = (id, start, end, color = 'aqua') => {
      this.primitives[id] = { type: 'boxgrid', id, start, end, color };
      for (const socket of this.sockets) {
        socket.emit('primitive', this.primitives[id]);
      }
    };

    bot.viewer.drawLine = (id, points, color = 0xff0000) => {
      this.primitives[id] = { type: 'line', id, points, color };
      for (const socket of this.sockets) {
        socket.emit('primitive', this.primitives[id]);
      }
    };

    bot.viewer.drawPoints = (id, points, color = 0xff0000, size = 5) => {
      this.primitives[id] = { type: 'points', id, points, color, size };
      for (const socket of this.sockets) {
        socket.emit('primitive', this.primitives[id]);
      }
    };

    bot.viewer.close = () => this.detachBot();

    for (const socket of this.sockets) {
      this.setupSocketForBot(socket);
    }
  }

  onConnection(socket) {
    this.sockets.push(socket);

    if (this.bot && this.bot.entity) {
      this.setupSocketForBot(socket);
    }

    socket.on('disconnect', () => {
      this.cleanupSocket(socket);
      const index = this.sockets.indexOf(socket);
      if (index !== -1) this.sockets.splice(index, 1);
    });
  }

  setupSocketForBot(socket) {
    const bot = this.bot;
    if (!bot || !bot.entity) return;

    this.cleanupSocket(socket);

    socket.emit('version', bot.version);

    let worldView;
    try {
      worldView = new WorldView(bot.world, this.viewDistance, bot.entity.position, socket);
    } catch (err) {
      console.error('[Viewer] Failed to create WorldView:', err.message);
      return;
    }

    worldView.on('blockClicked', (block, face, button) => {
      bot.viewer && bot.viewer.emit('blockClicked', block, face, button);
    });

    for (const id in this.primitives) {
      socket.emit('primitive', this.primitives[id]);
    }

    const botPosition = () => {
      if (!bot.entity) return;
      try {
        const packet = { pos: bot.entity.position, yaw: bot.entity.yaw, addMesh: true };
        if (this.firstPerson) packet.pitch = bot.entity.pitch;
        socket.emit('position', packet);
        // Defer world view update to avoid blocking event loop
        setImmediate(() => {
          try { worldView.updatePosition(bot.entity.position); } catch (_) {}
        });
      } catch (_) {}
    };

    bot.on('move', botPosition);

    // Defer listenToBot and init to next tick so bot keep-alive packets
    // are not blocked by heavy chunk processing
    setImmediate(() => {
      try {
        worldView.listenToBot(bot);
      } catch (err) {
        console.error('[Viewer] listenToBot error:', err.message);
      }
      setImmediate(() => {
        try {
          worldView.init(bot.entity.position);
        } catch (err) {
          console.error('[Viewer] worldView.init error:', err.message);
        }
      });
    });

    this.socketCleanups.set(socket, () => {
      try { bot.removeListener('move', botPosition); } catch (_) {}
      try { worldView.removeListenersFromBot(bot); } catch (_) {}
    });
  }

  cleanupSocket(socket) {
    const cleanup = this.socketCleanups.get(socket);
    if (cleanup) {
      cleanup();
      this.socketCleanups.delete(socket);
    }
  }

  detachBot() {
    if (!this.bot) return;

    for (const socket of this.sockets) {
      this.cleanupSocket(socket);
    }

    this.bot.viewer = null;
    this.bot = null;
    this.primitives = {};
  }
}

module.exports = { ViewerManager, VIEWER_PREFIX };
