import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commandDefinitions } from "./commandDefinitions.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

async function main(): Promise<void> {
  if (!token || !clientId) {
    throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required");
  }
  const rest = new REST({ version: "10" }).setToken(token);
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commandDefinitions,
    });
    console.log(`Guild commands deployed to ${guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commandDefinitions });
    console.log("Global commands deployed");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
