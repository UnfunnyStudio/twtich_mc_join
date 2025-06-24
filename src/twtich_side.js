import {env} from "../jsonenv.js";
import {fetchJSON} from "./helpers.js";
import {updateRefreshAccessToken} from "./dbCalls.js";


export const getTwitchUsersData = async (username, access_token) => {
    const userData = await fetchJSON(`https://api.twitch.tv/helix/users?login=${username}`, {
        headers: { "Authorization": `Bearer ${access_token}`, "Client-Id": env.client_id },
    });


    const data = userData.data?.[0];
    if (data) return data;
    console.error("[Twitch API Error]", userData);

    return {"error": "failed to get user data " + userData.error};
}

export const getTwitchUsersDataWithToken = async (access_token) => {
    const userData = await fetchJSON(`https://api.twitch.tv/helix/users`, {
        headers: {"Authorization": `Bearer ${access_token}`, "Client-Id": env.client_id},
    });
    const data = userData.data?.[0];
    if (data) return data;
    return {"error": "failed to get user data " + userData.error};
}



export const refreshAccessToken = async (id, refresh_token, twitch_refresh_epoc) => {
    if (Date.now() >= twitch_refresh_epoc) {
        console.log(`[INFO] Trying to refresh access token for user ${id}`);
        // Request a new token from Twitch
        const data = await fetchJSON("https://id.twitch.tv/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                client_id: env.client_id,
                client_secret: env.client_secret,
                refresh_token,
            }),
        });
        if (data?.access_token) {
            const new_expires_at = Date.now() + data.expires_in * 1000 - 10;
            const success = await updateRefreshAccessToken(
                id,
                data.access_token,
                data.refresh_token ?? refresh_token,
                new_expires_at
            );
            console.log(`[INFO] Refresh access token for user ${id}`);
            if (success) {
                return data?.access_token;
            }
            return null;
        } else {
            console.error(`[ERR] Failed to refresh token for user ${id}`);
            return null;
        }
    } else {
        console.log(`[INFO] user ${id} doesn't need to refresh there token`);
        return null;
    }
}

export const checkSub = async (broadcaster_id, twitch_id, access_token) => {
    const subData = await fetchJSON(`https://api.twitch.tv/helix/subscriptions/user?broadcaster_id=${broadcaster_id}&user_id=${twitch_id}`, {
        headers: {"Authorization": `Bearer ${access_token}`, "Client-Id": env.client_id},
    });
    const subTier = subData.data?.[0].tier;
    return subTier ? subTier / 1000 : 0;
}

// token can just be any users
export const getStreamersIds = async (usernames, token) => {
    const streamerId = [];
    for (const streamerUsername of usernames) {
        streamerId.push((await getTwitchUsersData(streamerUsername, token)).id);
    }
    return streamerId;
}