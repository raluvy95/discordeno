import { identifyPayload } from "../bot.ts";
import { cacheHandlers } from "../cache.ts";
import { RequestManager } from "../rest/request_manager.ts";
import { Guild, Member, structures } from "../structures/mod.ts";
import {
  AuditLogs,
  BannedUser,
  BanOptions,
  ChannelCreateOptions,
  ChannelCreatePayload,
  ChannelTypes,
  CreateEmojisOptions,
  CreateGuildFromTemplate,
  CreateGuildPayload,
  CreateGuildTemplate,
  CreateRoleOptions,
  CreateServerOptions,
  EditEmojisOptions,
  EditGuildTemplate,
  EditIntegrationOptions,
  Emoji,
  Errors,
  FetchMembersOptions,
  GetAuditLogsOptions,
  GetMemberOptions,
  GuildEditOptions,
  GuildTemplate,
  ImageFormats,
  ImageSize,
  Intents,
  MemberCreatePayload,
  Overwrite,
  Permission,
  PositionSwap,
  PruneOptions,
  PrunePayload,
  RoleData,
  UpdateGuildPayload,
  UserPayload,
} from "../types/mod.ts";
import { Collection } from "../util/collection.ts";
import { endpoints } from "../util/constants.ts";
import {
  calculateBits,
  requireBotGuildPermissions,
} from "../util/permissions.ts";
import {
  camelKeysToSnakeCase,
  formatImageURL,
  urlToBase64,
} from "../util/utils.ts";
import { requestAllMembers } from "../ws/shard_manager.ts";

/** Create a new guild. Returns a guild object on success. Fires a Guild Create Gateway event. This endpoint can be used only by bots in less than 10 guilds. */
export async function createGuild(options: CreateServerOptions) {
  const guild = (await RequestManager.post(
    endpoints.GUILDS,
    options,
  )) as CreateGuildPayload;

  return structures.createGuildStruct(guild, 0);
}

/** Delete a guild permanently. User must be owner. Returns 204 No Content on success. Fires a Guild Delete Gateway event.
 */
export async function deleteServer(guildID: string) {
  const result = await RequestManager.delete(endpoints.GUILDS_BASE(guildID));

  return result;
}

/** Gets an array of all the channels ids that are the children of this category. */
export function categoryChildrenIDs(guildID: string, id: string) {
  return cacheHandlers.filter(
    "channels",
    (channel) => channel.parentID === id && channel.guildID === guildID,
  );
}

/** The full URL of the icon from Discords CDN. Undefined when no icon is set. */
export function guildIconURL(
  guild: Guild,
  size: ImageSize = 128,
  format?: ImageFormats,
) {
  return guild.icon
    ? formatImageURL(endpoints.GUILD_ICON(guild.id, guild.icon), size, format)
    : undefined;
}

/** The full URL of the splash from Discords CDN. Undefined if no splash is set. */
export function guildSplashURL(
  guild: Guild,
  size: ImageSize = 128,
  format?: ImageFormats,
) {
  return guild.splash
    ? formatImageURL(
      endpoints.GUILD_SPLASH(guild.id, guild.splash),
      size,
      format,
    )
    : undefined;
}

/** The full URL of the banner from Discords CDN. Undefined if no banner is set. */
export function guildBannerURL(
  guild: Guild,
  size: ImageSize = 128,
  format?: ImageFormats,
) {
  return guild.banner
    ? formatImageURL(
      endpoints.GUILD_BANNER(guild.id, guild.banner),
      size,
      format,
    )
    : undefined;
}

/** Create a channel in your server. Bot needs MANAGE_CHANNEL permissions in the server. */
export async function createGuildChannel(
  guildID: string,
  name: string,
  options?: ChannelCreateOptions,
) {
  const requiredPerms: Set<Permission> = new Set(["MANAGE_CHANNELS"]);

  options?.permissionOverwrites?.forEach((overwrite) => {
    overwrite.allow.forEach(requiredPerms.add, requiredPerms);
    overwrite.deny.forEach(requiredPerms.add, requiredPerms);
  });

  await requireBotGuildPermissions(guildID, [...requiredPerms]);

  const result = (await RequestManager.post(
    endpoints.GUILD_CHANNELS(guildID),
    {
      ...options,
      name,
      permission_overwrites: options?.permissionOverwrites?.map((perm) => ({
        ...perm,

        allow: calculateBits(perm.allow),
        deny: calculateBits(perm.deny),
      })),
      type: options?.type || ChannelTypes.GUILD_TEXT,
    },
  )) as ChannelCreatePayload;

  const channelStruct = await structures.createChannelStruct(result);
  await cacheHandlers.set("channels", channelStruct.id, channelStruct);

  return channelStruct;
}

/** Delete a channel in your server. Bot needs MANAGE_CHANNEL permissions in the server. */
export async function deleteChannel(
  guildID: string,
  channelID: string,
  reason?: string,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_CHANNELS"]);

  const guild = await cacheHandlers.get("guilds", guildID);
  if (!guild) throw new Error(Errors.GUILD_NOT_FOUND);

  if (guild?.rulesChannelID === channelID) {
    throw new Error(Errors.RULES_CHANNEL_CANNOT_BE_DELETED);
  }

  if (guild?.publicUpdatesChannelID === channelID) {
    throw new Error(Errors.UPDATES_CHANNEL_CANNOT_BE_DELETED);
  }

  const result = await RequestManager.delete(
    endpoints.CHANNEL_BASE(channelID),
    { reason },
  );

  return result;
}

/** Returns a list of guild channel objects.
 *
 * ⚠️ **If you need this, you are probably doing something wrong. This is not intended for use. Your channels will be cached in your guild.**
 */
export async function getChannels(guildID: string, addToCache = true) {
  const result = (await RequestManager.get(
    endpoints.GUILD_CHANNELS(guildID),
  ) as ChannelCreatePayload[]);

  return Promise.all(result.map(async (res) => {
    const channelStruct = await structures.createChannelStruct(res, guildID);
    if (addToCache) {
      await cacheHandlers.set("channels", channelStruct.id, channelStruct);
    }

    return channelStruct;
  }));
}

/** Fetches a single channel object from the api.
 *
 * ⚠️ **If you need this, you are probably doing something wrong. This is not intended for use. Your channels will be cached in your guild.**
 */
export async function getChannel(channelID: string, addToCache = true) {
  const result = (await RequestManager.get(
    endpoints.CHANNEL_BASE(channelID),
  )) as ChannelCreatePayload;

  const channelStruct = await structures.createChannelStruct(
    result,
    result.guild_id,
  );
  if (addToCache) {
    await cacheHandlers.set("channels", channelStruct.id, channelStruct);
  }

  return channelStruct;
}

/** Modify the positions of channels on the guild. Requires MANAGE_CHANNELS permisison. */
export async function swapChannels(
  guildID: string,
  channelPositions: PositionSwap[],
) {
  if (channelPositions.length < 2) {
    throw "You must provide at least two channels to be swapped.";
  }

  const result = await RequestManager.patch(
    endpoints.GUILD_CHANNELS(guildID),
    channelPositions,
  );

  return result;
}

/** Edit the channel permission overwrites for a user or role in this channel. Requires `MANAGE_ROLES` permission. */
export async function editChannelOverwrite(
  guildID: string,
  channelID: string,
  overwriteID: string,
  options: Omit<Overwrite, "id">,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_ROLES"]);

  const result = await RequestManager.put(
    endpoints.CHANNEL_OVERWRITE(channelID, overwriteID),
    {
      allow: calculateBits(options.allow),
      deny: calculateBits(options.deny),
      type: options.type,
    },
  );

  return result;
}

/** Delete the channel permission overwrites for a user or role in this channel. Requires `MANAGE_ROLES` permission. */
export async function deleteChannelOverwrite(
  guildID: string,
  channelID: string,
  overwriteID: string,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_ROLES"]);

  const result = await RequestManager.delete(
    endpoints.CHANNEL_OVERWRITE(channelID, overwriteID),
  );

  return result;
}

/** Returns a guild member object for the specified user.
 *
 * ⚠️ **ADVANCED USE ONLY: Your members will be cached in your guild most likely. Only use this when you are absolutely sure the member is not cached.**
 */
export async function getMember(
  guildID: string,
  id: string,
  options?: { force?: boolean },
) {
  const guild = await cacheHandlers.get("guilds", guildID);
  if (!guild && !options?.force) return;

  const data = (await RequestManager.get(
    endpoints.GUILD_MEMBER(guildID, id),
  )) as MemberCreatePayload;

  const memberStruct = await structures.createMemberStruct(data, guildID);
  await cacheHandlers.set("members", memberStruct.id, memberStruct);

  return memberStruct;
}

/** Returns guild member objects for the specified user by their nickname/username.
 *
 * ⚠️ **ADVANCED USE ONLY: Your members will be cached in your guild most likely. Only use this when you are absolutely sure the member is not cached.**
 */
export async function getMembersByQuery(
  guildID: string,
  name: string,
  limit = 1,
) {
  const guild = await cacheHandlers.get("guilds", guildID);
  if (!guild) return;

  return new Promise((resolve) => {
    return requestAllMembers(guild, resolve, { query: name, limit });
  }) as Promise<Collection<string, Member>>;
}

/** Create an emoji in the server. Emojis and animated emojis have a maximum file size of 256kb. Attempting to upload an emoji larger than this limit will fail and return 400 Bad Request and an error message, but not a JSON status code. If a URL is provided to the image parameter, Discordeno will automatically convert it to a base64 string internally. */
export async function createEmoji(
  guildID: string,
  name: string,
  image: string,
  options: CreateEmojisOptions,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_EMOJIS"]);

  if (image && !image.startsWith("data:image/")) {
    image = await urlToBase64(image);
  }

  const result = await RequestManager.post(endpoints.GUILD_EMOJIS(guildID), {
    ...options,
    name,
    image,
  });

  return result;
}

/** Modify the given emoji. Requires the MANAGE_EMOJIS permission. */
export async function editEmoji(
  guildID: string,
  id: string,
  options: EditEmojisOptions,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_EMOJIS"]);

  const result = await RequestManager.patch(
    endpoints.GUILD_EMOJI(guildID, id),
    {
      name: options.name,
      roles: options.roles,
    },
  );

  return result;
}

/** Delete the given emoji. Requires the MANAGE_EMOJIS permission. Returns 204 No Content on success. */
export async function deleteEmoji(
  guildID: string,
  id: string,
  reason?: string,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_EMOJIS"]);

  const result = await RequestManager.delete(
    endpoints.GUILD_EMOJI(guildID, id),
    { reason },
  );

  return result;
}

/** Creates a url to the emoji from the Discord CDN. */
export function emojiURL(id: string, animated = false) {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}`;
}

/**
 * Returns a list of emojis for the given guild.
 *
 * ⚠️ **If you need this, you are probably doing something wrong. Always use cache.guilds.get()?.emojis
 */
export async function getEmojis(guildID: string, addToCache = true) {
  const result = (await RequestManager.get(
    endpoints.GUILD_EMOJIS(guildID),
  )) as Emoji[];

  if (addToCache) {
    const guild = await cacheHandlers.get("guilds", guildID);
    if (!guild) throw new Error(Errors.GUILD_NOT_FOUND);

    result.forEach((emoji) => guild.emojis.set(emoji.id ?? emoji.name, emoji));

    cacheHandlers.set("guilds", guildID, guild);
  }

  return result;
}

/**
 * Returns an emoji for the given guild and emoji ID.
 *
 * ⚠️ **If you need this, you are probably doing something wrong. Always use cache.guilds.get()?.emojis
 */
export async function getEmoji(
  guildID: string,
  emojiID: string,
  addToCache = true,
) {
  const result = (await RequestManager.get(
    endpoints.GUILD_EMOJI(guildID, emojiID),
  )) as Emoji;

  if (addToCache) {
    const guild = await cacheHandlers.get("guilds", guildID);
    if (!guild) throw new Error(Errors.GUILD_NOT_FOUND);
    guild.emojis.set(result.id ?? result.name, result);
    cacheHandlers.set(
      "guilds",
      guildID,
      guild,
    );
  }

  return result;
}

/** Create a new role for the guild. Requires the MANAGE_ROLES permission. */
export async function createRole(
  guildID: string,
  options: CreateRoleOptions,
  reason?: string,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_ROLES"]);

  const result = await RequestManager.post(endpoints.GUILD_ROLES(guildID), {
    ...options,
    permissions: calculateBits(options?.permissions || []),
    reason,
  });

  const roleData = result as RoleData;
  const role = await structures.createRoleStruct(roleData);
  const guild = await cacheHandlers.get("guilds", guildID);
  guild?.roles.set(role.id, role);

  return role;
}

/** Edit a guild role. Requires the MANAGE_ROLES permission. */
export async function editRole(
  guildID: string,
  id: string,
  options: CreateRoleOptions,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_ROLES"]);

  const result = await RequestManager.patch(endpoints.GUILD_ROLE(guildID, id), {
    ...options,
    permissions: options.permissions
      ? calculateBits(options.permissions)
      : undefined,
  });

  return result;
}

/** Delete a guild role. Requires the MANAGE_ROLES permission. */
export async function deleteRole(guildID: string, id: string) {
  await requireBotGuildPermissions(guildID, ["MANAGE_ROLES"]);

  const result = await RequestManager.delete(endpoints.GUILD_ROLE(guildID, id));

  return result;
}

/** Returns a list of role objects for the guild.
 *
 * ⚠️ **If you need this, you are probably doing something wrong. This is not intended for use. Your roles will be cached in your guild.**
 */
export async function getRoles(guildID: string) {
  await requireBotGuildPermissions(guildID, ["MANAGE_ROLES"]);

  const result = await RequestManager.get(endpoints.GUILD_ROLES(guildID));

  return result;
}

/** Modify the positions of a set of role objects for the guild. Requires the MANAGE_ROLES permission. */
export async function swapRoles(guildID: string, rolePositons: PositionSwap) {
  await requireBotGuildPermissions(guildID, ["MANAGE_ROLES"]);

  const result = await RequestManager.patch(
    endpoints.GUILD_ROLES(guildID),
    rolePositons,
  );

  return result;
}

/** Check how many members would be removed from the server in a prune operation. Requires the KICK_MEMBERS permission */
export async function getPruneCount(guildID: string, options?: PruneOptions) {
  if (options?.days && options.days < 1) throw new Error(Errors.PRUNE_MIN_DAYS);
  if (options?.days && options.days > 30) {
    throw new Error(Errors.PRUNE_MAX_DAYS);
  }

  await requireBotGuildPermissions(guildID, ["KICK_MEMBERS"]);

  const result = await RequestManager.get(
    endpoints.GUILD_PRUNE(guildID),
    camelKeysToSnakeCase(options ?? {}),
  ) as PrunePayload;

  return result.pruned;
}

/**
 * Begin a prune operation. Requires the KICK_MEMBERS permission. Returns an object with one 'pruned' key indicating the number of members that were removed in the prune operation. For large guilds it's recommended to set the computePruneCount option to false, forcing 'pruned' to null. Fires multiple Guild Member Remove Gateway events.
 * 
 * By default, prune will not remove users with roles. You can optionally include specific roles in your prune by providing the roles (resolved to include_roles internally) parameter. Any inactive user that has a subset of the provided role(s) will be included in the prune and users with additional roles will not.
 */
export async function pruneMembers(
  guildID: string,
  options: PruneOptions,
) {
  if (options.days && options.days < 1) throw new Error(Errors.PRUNE_MIN_DAYS);
  if (options.days && options.days > 30) throw new Error(Errors.PRUNE_MAX_DAYS);

  await requireBotGuildPermissions(guildID, ["KICK_MEMBERS"]);

  const result = await RequestManager.post(
    endpoints.GUILD_PRUNE(guildID),
    camelKeysToSnakeCase(options),
  );

  return result;
}

/**
 * ⚠️ BEGINNER DEVS!! YOU SHOULD ALMOST NEVER NEED THIS AND YOU CAN GET FROM cache.members.get()
 *
 * ADVANCED:
 * Highly recommended to use this function to fetch members instead of getMember from REST.
 * REST: 50/s global(across all shards) rate limit with ALL requests this included
 * GW(this function): 120/m(PER shard) rate limit. Meaning if you have 8 shards your limit is now 960/m.
 */
export function fetchMembers(guild: Guild, options?: FetchMembersOptions) {
  // You can request 1 member without the intent
  if (
    (!options?.limit || options.limit > 1) &&
    !(identifyPayload.intents && Intents.GUILD_MEMBERS)
  ) {
    throw new Error(Errors.MISSING_INTENT_GUILD_MEMBERS);
  }

  if (options?.userIDs?.length) {
    options.limit = options.userIDs.length;
  }

  return new Promise((resolve) => {
    return requestAllMembers(guild, resolve, options);
  }) as Promise<Collection<string, Member>>;
}

/**
 * ⚠️ BEGINNER DEVS!! YOU SHOULD ALMOST NEVER NEED THIS AND YOU CAN GET FROM cache.members.get()
 *
 * ADVANCED:
 * Highly recommended to **NOT** use this function to get members instead use fetchMembers().
 * REST(this function): 50/s global(across all shards) rate limit with ALL requests this included
 * GW(fetchMembers): 120/m(PER shard) rate limit. Meaning if you have 8 shards your limit is 960/m.
 */
export async function getMembers(guildID: string, options?: GetMemberOptions) {
  if (!(identifyPayload.intents && Intents.GUILD_MEMBERS)) {
    throw new Error(Errors.MISSING_INTENT_GUILD_MEMBERS);
  }

  const guild = await cacheHandlers.get("guilds", guildID);
  if (!guild) throw new Error(Errors.GUILD_NOT_FOUND);

  const members = new Collection<string, Member>();

  let membersLeft = options?.limit ?? guild.memberCount;
  let loops = 1;
  while (
    (options?.limit ?? guild.memberCount) > members.size &&
    membersLeft > 0
  ) {
    if (options?.limit && options.limit > 1000) {
      console.log(
        `Paginating get members from REST. #${loops} / ${
          Math.ceil(
            (options?.limit ?? 1) / 1000,
          )
        }`,
      );
    }

    const result = (await RequestManager.get(
      `${endpoints.GUILD_MEMBERS(guildID)}?limit=${
        membersLeft > 1000 ? 1000 : membersLeft
      }${options?.after ? `&after=${options.after}` : ""}`,
    )) as MemberCreatePayload[];

    const memberStructures = await Promise.all(
      result.map(async (member) => {
        const memberStruct = await structures.createMemberStruct(
          member,
          guildID,
        );

        await cacheHandlers.set("members", memberStruct.id, memberStruct);

        return memberStruct;
      }),
    ) as Member[];

    if (!memberStructures.length) break;

    memberStructures.forEach((member) => members.set(member.id, member));

    options = {
      limit: options?.limit,
      after: memberStructures[memberStructures.length - 1].id,
    };

    membersLeft -= 1000;

    loops++;
  }

  return members;
}

/** Returns the audit logs for the guild. Requires VIEW AUDIT LOGS permission */
export async function getAuditLogs(
  guildID: string,
  options: GetAuditLogsOptions,
) {
  await requireBotGuildPermissions(guildID, ["VIEW_AUDIT_LOG"]);

  const result = await RequestManager.get(endpoints.GUILD_AUDIT_LOGS(guildID), {
    ...options,
    action_type: options.action_type
      ? AuditLogs[options.action_type]
      : undefined,
    limit: options.limit && options.limit >= 1 && options.limit <= 100
      ? options.limit
      : 50,
  });

  return result;
}

/** Returns the guild widget object. Requires the MANAGE_GUILD permission. */
export async function getWidgetSettings(guildID: string) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  const result = await RequestManager.get(endpoints.GUILD_WIDGET(guildID));

  return result;
}

/** Modify a guild widget object for the guild. Requires the MANAGE_GUILD permission. */
export async function editWidget(
  guildID: string,
  enabled: boolean,
  channelID?: string | null,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  const result = await RequestManager.patch(endpoints.GUILD_WIDGET(guildID), {
    enabled,
    channel_id: channelID,
  });

  return result;
}

/** Returns the widget for the guild. */
export async function getWidget(guildID: string, options?: { force: boolean }) {
  if (!options?.force) {
    const guild = await cacheHandlers.get("guilds", guildID);
    if (!guild) throw new Error(Errors.GUILD_NOT_FOUND);
    if (!guild?.widgetEnabled) throw new Error(Errors.GUILD_WIDGET_NOT_ENABLED);
  }

  return RequestManager.get(`${endpoints.GUILD_WIDGET(guildID)}.json`);
}

/** Returns the widget image URL for the guild. */
export async function getWidgetImageUrl(
  guildID: string,
  options?: {
    style?: "shield" | "banner1" | "banner2" | "banner3" | "banner4";
    force?: boolean;
  },
) {
  if (!options?.force) {
    const guild = await cacheHandlers.get("guilds", guildID);
    if (!guild) throw new Error(Errors.GUILD_NOT_FOUND);
    if (!guild.widgetEnabled) throw new Error(Errors.GUILD_WIDGET_NOT_ENABLED);
  }

  return `${endpoints.GUILD_WIDGET(guildID)}.png?style=${options?.style ??
    "shield"}`;
}

/** Returns the code and uses of the vanity url for this server if it is enabled. Requires the MANAGE_GUILD permission. */
export async function getVanityURL(guildID: string) {
  const result = await RequestManager.get(endpoints.GUILD_VANITY_URL(guildID));

  return result;
}

/** Returns a list of integrations for the guild. Requires the MANAGE_GUILD permission. */
export async function getIntegrations(guildID: string) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  const result = await RequestManager.get(
    endpoints.GUILD_INTEGRATIONS(guildID),
  );

  return result;
}

/** Modify the behavior and settings of an integration object for the guild. Requires the MANAGE_GUILD permission. */
export async function editIntegration(
  guildID: string,
  id: string,
  options: EditIntegrationOptions,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  const result = await RequestManager.patch(
    endpoints.GUILD_INTEGRATION(guildID, id),
    options,
  );

  return result;
}

/** Delete the attached integration object for the guild with this id. Requires MANAGE_GUILD permission. */
export async function deleteIntegration(guildID: string, id: string) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  const result = await RequestManager.delete(
    endpoints.GUILD_INTEGRATION(guildID, id),
  );

  return result;
}

/** Sync an integration. Requires the MANAGE_GUILD permission. */
export async function syncIntegration(guildID: string, id: string) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  const result = await RequestManager.post(
    endpoints.GUILD_INTEGRATION_SYNC(guildID, id),
  );

  return result;
}

/** Returns a list of ban objects for the users banned from this guild. Requires the BAN_MEMBERS permission. */
export async function getBans(guildID: string) {
  await requireBotGuildPermissions(guildID, ["BAN_MEMBERS"]);

  const results = (await RequestManager.get(
    endpoints.GUILD_BANS(guildID),
  )) as BannedUser[];

  return new Collection<string, BannedUser>(
    results.map((res) => [res.user.id, res]),
  );
}

/** Returns a ban object for the given user or a 404 not found if the ban cannot be found. Requires the BAN_MEMBERS permission. */
export async function getBan(guildID: string, memberID: string) {
  await requireBotGuildPermissions(guildID, ["BAN_MEMBERS"]);

  const result = await RequestManager.get(
    endpoints.GUILD_BAN(guildID, memberID),
  );

  return result as BannedUser;
}

/** Ban a user from the guild and optionally delete previous messages sent by the user. Requires the BAN_MEMBERS permission. */
export async function ban(guildID: string, id: string, options: BanOptions) {
  await requireBotGuildPermissions(guildID, ["BAN_MEMBERS"]);

  const result = await RequestManager.put(endpoints.GUILD_BAN(guildID, id), {
    ...options,
    delete_message_days: options.days,
  });

  return result;
}

/** Remove the ban for a user. Requires BAN_MEMBERS permission */
export async function unban(guildID: string, id: string) {
  await requireBotGuildPermissions(guildID, ["BAN_MEMBERS"]);

  const result = await RequestManager.delete(endpoints.GUILD_BAN(guildID, id));

  return result;
}

/** Returns the guild preview object for the given id. If the bot is not in the guild, then the guild must be Discoverable. */
export async function getGuildPreview(guildID: string) {
  const result = await RequestManager.get(endpoints.GUILD_PREVIEW(guildID));

  return result;
}

/** Modify a guilds settings. Requires the MANAGE_GUILD permission. */
export async function editGuild(guildID: string, options: GuildEditOptions) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  if (options.icon && !options.icon.startsWith("data:image/")) {
    options.icon = await urlToBase64(options.icon);
  }

  if (options.banner && !options.banner.startsWith("data:image/")) {
    options.banner = await urlToBase64(options.banner);
  }

  if (options.splash && !options.splash.startsWith("data:image/")) {
    options.splash = await urlToBase64(options.splash);
  }

  const result = await RequestManager.patch(
    endpoints.GUILDS_BASE(guildID),
    options,
  );

  return result;
}

/** Get all the invites for this guild. Requires MANAGE_GUILD permission */
export async function getInvites(guildID: string) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  const result = await RequestManager.get(endpoints.GUILD_INVITES(guildID));

  return result;
}

/** Leave a guild */
export async function leaveGuild(guildID: string) {
  const result = await RequestManager.delete(endpoints.GUILD_LEAVE(guildID));

  return result;
}

/** Returns an array of voice regions that can be used when creating servers. */
export async function getAvailableVoiceRegions() {
  const result = await RequestManager.get(endpoints.VOICE_REGIONS);

  return result;
}

/** Returns a list of voice region objects for the guild. Unlike the similar /voice route, this returns VIP servers when the guild is VIP-enabled. */
export async function getVoiceRegions(guildID: string) {
  const result = await RequestManager.get(endpoints.GUILD_REGIONS(guildID));

  return result;
}

/** Returns a list of guild webhooks objects. Requires the MANAGE_WEBHOOKs permission. */
export async function getWebhooks(guildID: string) {
  await requireBotGuildPermissions(guildID, ["MANAGE_WEBHOOKS"]);

  const result = await RequestManager.get(endpoints.GUILD_WEBHOOKS(guildID));

  return result;
}

/** This function will return the raw user payload in the rare cases you need to fetch a user directly from the API. */
export async function getUser(userID: string) {
  const result = await RequestManager.get(endpoints.USER(userID));

  return result as UserPayload;
}

/**
 * ⚠️ **If you need this, you are probably doing something wrong. Always use cache.guilds.get()
 *
 * Advanced Devs:
 * This function fetches a guild's data. This is not the same data as a GUILD_CREATE.
 * So it does not cache the guild, you must do it manually.
 * */
export async function getGuild(guildID: string, counts = true) {
  const result = await RequestManager.get(endpoints.GUILDS_BASE(guildID), {
    with_counts: counts,
  });

  return result as UpdateGuildPayload;
}

/** Returns the guild template if it exists */
export async function getTemplate(templateCode: string) {
  const result = (await RequestManager.get(
    endpoints.GUILD_TEMPLATE(templateCode),
  ) as GuildTemplate);
  const template = await structures.createTemplateStruct(result);

  return template;
}

/**
 * Returns the guild template if it exists
 * @deprecated will get removed in v11 use `getTemplate` instead
 */
export function getGuildTemplate(guildID: string, templateCode: string) {
  return getTemplate(templateCode);
}

/**
 * Create a new guild based on a template
 * NOTE: This endpoint can be used only by bots in less than 10 guilds.
 */
export async function createGuildFromTemplate(
  templateCode: string,
  data: CreateGuildFromTemplate,
) {
  if ((await cacheHandlers.size("guilds")) >= 10) {
    throw new Error(
      "This function can only be used by bots in less than 10 guilds.",
    );
  }

  if (data.icon) {
    data.icon = await urlToBase64(data.icon);
  }

  const result = await await RequestManager.post(
    endpoints.GUILD_TEMPLATE(templateCode),
    data,
  );

  return result as CreateGuildPayload;
}

/**
 * Returns an array of templates.
 * Requires the `MANAGE_GUILD` permission.
 */
export async function getGuildTemplates(guildID: string) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  const templates = (await RequestManager.get(
    endpoints.GUILD_TEMPLATES(guildID),
  )) as GuildTemplate[];

  return templates.map((template) => structures.createTemplateStruct(template));
}

/**
 * Deletes a template from a guild.
 * Requires the `MANAGE_GUILD` permission.
 */
export async function deleteGuildTemplate(
  guildID: string,
  templateCode: string,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  const deletedTemplate = (await RequestManager.delete(
    `${endpoints.GUILD_TEMPLATES(guildID)}/${templateCode}`,
  )) as GuildTemplate;

  return structures.createTemplateStruct(deletedTemplate);
}

/**
 * Creates a template for the guild.
 * Requires the `MANAGE_GUILD` permission.
 * @param name name of the template (1-100 characters)
 * @param description description for the template (0-120 characters
 */
export async function createGuildTemplate(
  guildID: string,
  data: CreateGuildTemplate,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  if (data.name.length < 1 || data.name.length > 100) {
    throw new Error("The name can only be in between 1-100 characters.");
  }

  if (data.description?.length && data.description.length > 120) {
    throw new Error("The description can only be in between 0-120 characters.");
  }

  const template = (await RequestManager.post(
    endpoints.GUILD_TEMPLATES(guildID),
    data,
  )) as GuildTemplate;

  return structures.createTemplateStruct(template);
}

/**
 * Syncs the template to the guild's current state.
 * Requires the `MANAGE_GUILD` permission.
 */
export async function syncGuildTemplate(guildID: string, templateCode: string) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  const template = (await RequestManager.put(
    `${endpoints.GUILD_TEMPLATES(guildID)}/${templateCode}`,
  )) as GuildTemplate;

  return structures.createTemplateStruct(template);
}

/**
 * Edit a template's metadata.
 * Requires the `MANAGE_GUILD` permission.
 */
export async function editGuildTemplate(
  guildID: string,
  templateCode: string,
  data: EditGuildTemplate,
) {
  await requireBotGuildPermissions(guildID, ["MANAGE_GUILD"]);

  if (data.name?.length && (data.name.length < 1 || data.name.length > 100)) {
    throw new Error("The name can only be in between 1-100 characters.");
  }

  if (data.description?.length && data.description.length > 120) {
    throw new Error("The description can only be in between 0-120 characters.");
  }

  const template = (await RequestManager.patch(
    `${endpoints.GUILD_TEMPLATES(guildID)}/${templateCode}`,
    data,
  )) as GuildTemplate;

  return structures.createTemplateStruct(template);
}