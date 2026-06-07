const mineflayer = require('mineflayer');

console.log("Starting diagnostic connection to dynamic-8.magmanode.com:25752...");
const bot = mineflayer.createBot({
  host: 'dynamic-8.magmanode.com',
  port: 25752,
  username: 'MagmaAFK',
  auth: 'offline',
  version: '1.21.4',
  physicsEnabled: false,
  checkTimeoutInterval: 60000,
  closeTimeout: 60000
});

bot.on('inject_allowed', () => {
  console.log('Client loaded. Handshaking...');
});

bot.on('login', () => {
  console.log('Logged in successfully!');
});

bot.on('spawn', () => {
  console.log('Spawned in world successfully!');
  bot.quit();
});

bot.on('error', (err) => {
  console.error('================ BOT ERROR ================');
  console.error(err);
  console.error('===========================================');
});

bot.on('kicked', (reason) => {
  console.log('================ KICKED ================');
  console.dir(reason, { depth: null });
  console.log('========================================');
});

bot.on('end', (reason) => {
  console.log('Connection ended. Reason:', reason);
});
