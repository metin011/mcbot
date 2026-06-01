const mc = require('minecraft-protocol');

console.log("Pinging server: dynamic-8.magmanode.com:25752...");
mc.ping({
  host: 'dynamic-8.magmanode.com',
  port: 25752,
  closeTimeout: 5000
}, (err, response) => {
  if (err) {
    console.error("Ping error:", err);
    return;
  }
  console.log("Ping response successfully received!");
  console.log("=========================================");
  console.log("Version Name:", response.version.name);
  console.log("Protocol Version:", response.version.protocol);
  console.log("Description:", JSON.stringify(response.description));
  console.log("Players Online:", response.players.online, "/", response.players.max);
  if (response.players.sample) {
    console.log("Player Sample:", response.players.sample.map(p => p.name).join(", "));
  }
  console.log("=========================================");
});
