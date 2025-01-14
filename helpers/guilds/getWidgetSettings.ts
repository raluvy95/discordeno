import type { Bot } from "../../bot.ts";
import { GuildWidgetSettings } from "../../transformers/widgetSettings.ts";
import { DiscordGuildWidgetSettings } from "../../types/discord.ts";

/** Returns a guild widget settings object. Requires the MANAGE_GUILD permission. */
export async function getWidgetSettings(bot: Bot, guildId: bigint): Promise<GuildWidgetSettings> {
  const result = await bot.rest.runMethod<DiscordGuildWidgetSettings>(
    bot.rest,
    "GET",
    bot.constants.routes.GUILD_WIDGET(guildId),
  );

  return bot.transformers.widgetSettings(bot, result);
}
