import type { Bot } from "../../bot.ts";

/** Delete the attached integration object for the guild with this id. Requires MANAGE_GUILD permission. */
export async function deleteIntegration(bot: Bot, guildId: bigint, id: bigint): Promise<void> {
  return await bot.rest.runMethod<void>(bot.rest, "DELETE", bot.constants.routes.GUILD_INTEGRATION(guildId, id));
}
