import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from "discord.js";
import cron from "node-cron";
import { handleChatInputCommand } from "./commandHandler.js";
import { handleTodoConfirmButton } from "./buttonHandler.js";
import { runReminderTick } from "./services/reminderScheduler.js";

if (!process.env.NOTION_TOKEN?.trim()) {
  throw new Error("NOTION_TOKEN is required");
}
if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}
if (!process.env.GUILD_SETTINGS_ENCRYPTION_KEY?.trim()) {
  throw new Error("GUILD_SETTINGS_ENCRYPTION_KEY is required");
}
if (!process.env.DISCORD_TOKEN) {
  throw new Error("DISCORD_TOKEN is required");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction);
      return;
    }
    if (interaction.isButton()) {
      const handled = await handleTodoConfirmButton(interaction);
      if (handled) return;
    }
  } catch (e) {
    console.error(e);
  }
});

cron.schedule("*/2 * * * *", () => {
  void runReminderTick(client);
});

await client.login(process.env.DISCORD_TOKEN);
