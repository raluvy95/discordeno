const User = require("../Structures/User");
module.exports = async (client, payload) => {
  client.user = client.users.forge(payload.user);
  if (payload.shardId + 1 === client.gateway.maxShards) {
    //All Shards are ready
    console.log("Successfully connected to the gateway as " + client.user.tag);
  }
};
