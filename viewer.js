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

    const worldView = new WorldView(bot.world, this.viewDistance, bot.entity.position, socket);
    worldView.init(bot.entity.position);

    worldView.on('blockClicked', (block, face, button) => {
      bot.viewer.emit('blockClicked', block, face, button);
    });

    for (const id in this.primitives) {
      socket.emit('primitive', this.primitives[id]);
    }

    const botPosition = () => {
      if (!bot.entity) return;
      const packet = { pos: bot.entity.position, yaw: bot.entity.yaw, addMesh: true };
      if (this.firstPerson) {
        packet.pitch = bot.entity.pitch;
      }
      socket.emit('position', packet);
      worldView.updatePosition(bot.entity.position);
    };

    bot.on('move', botPosition);
    worldView.listenToBot(bot);

    this.socketCleanups.set(socket, () => {
      bot.removeListener('move', botPosition);
      worldView.removeListenersFromBot(bot);
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
