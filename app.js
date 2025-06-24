import {env} from './jsonenv.js'
import express from 'express'
import {
    addNewUsersTokens,
    getIsUserSubTierFromDb,
    getListOfAllUsersTwitchDetails,
    getListOfStreamers, getUsersTwitchDetails, insertUserSubByTwitchAndStreamer,
    removeUserSub, updateMinecraftUuid, updateUserSubTierByTwitchAndStreamer
} from "./src/dbCalls.js";
import {
    checkSub,
    getStreamersIds,
    getTwitchUsersData,
    getTwitchUsersDataWithToken,
    refreshAccessToken
} from "./src/twtich_side.js";
import {fetchJSON} from "./src/helpers.js";

const app = express()
app.set('view engine', 'ejs');
app.use(express.static('public'))
app.use(express.json());

const port = 3000;
const redirect_uri = env.redirect_uri || "http://localhost:3000/auth/twitch/callback";

app.get("/", (req, res) => res.render("index", {client_id: env.client_id, redirect_uri}));

app.get("/help", (req, res) => {
    res.render("help");
});

async function processTwitchAuthCode(code) {
    const data = await fetchJSON("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
            client_id: env.client_id,
            client_secret: env.client_secret,
            code,
            grant_type: "authorization_code",
            redirect_uri
        })
    });

    if (!data?.access_token) {
        console.error("Failed to get token", data);
        return;
    }

    const expiresAt = Date.now() + data.expires_in * 1000 - 10;
    const userId = (await getTwitchUsersDataWithToken(data.access_token)).id;

    await addNewUsersTokens(userId, data.access_token, data.refresh_token, expiresAt);
    console.log(`Processed auth for user ${userId}`);
}

app.get("/auth/twitch/callback", async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) {
            res.send("Authentication error, check console");
            return;
        }
        const data = await fetchJSON("https://id.twitch.tv/oauth2/token", {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({
                client_id: env.client_id,
                client_secret: env.client_secret,
                code,
                grant_type: "authorization_code",
                redirect_uri
            })
        });
        const expiresAt = Date.now() + data.expires_in * 1000 - 10;
        const userId = (await getTwitchUsersDataWithToken(data.access_token)).id;
        await addNewUsersTokens(userId, data.access_token, data.refresh_token, expiresAt);
        res.render("callback", {token: data.access_token});
    } catch (error) {
        res.send("Authentication error, please let the auto redirect change the page by itself <a href='/'>GO BACK</a>");


    }

});

app.post("/api/java-entry", async (req, res) => {
    const {minecraft_name, twitch_token} = req.body;

    if (!minecraft_name || !twitch_token) {
        return res.status(400).json({error: 'Missing required fields'});
    }

    const player_data = await fetchJSON(`https://api.mojang.com/users/profiles/minecraft/${minecraft_name}`);
    if (!player_data?.id) {
        return res.status(400).json({error: 'Invalid player name'});
    }

    console.log(await updateMinecraftUuid(player_data.id, twitch_token));

    await updateIsSubed((await getUsersTwitchDetails(twitch_token)));

    res.status(200).json({message: "Entry received successfully", subscribed: true});
});

app.post("/api/bedrock-entry", async (req, res) => {
    let {bedrock_uuid, twitch_token} = req.body;

    if (!bedrock_uuid || !twitch_token) {
        return res.status(400).json({error: 'Missing required fields'});
    }

    if (!/^[0-9a-fA-F]{1,16}$/.test(bedrock_uuid)) {
        return res.status(400).json({error: 'Invalid XUID format'});
    }
    bedrock_uuid = "0000000000000000" + bedrock_uuid;

    console.log(await updateMinecraftUuid(bedrock_uuid, twitch_token, true));

    await updateIsSubed((await getUsersTwitchDetails(twitch_token)));

    res.status(200).json({message: "Entry received successfully", subscribed: true});
});


const updateIsSubed = async (usersTwitchDetails) => {
    const streamerUsernames = await getListOfStreamers();
    let streamerIds = [];
    let hasGotStreamerIds = false;
    for (const user of usersTwitchDetails) {
        let {id, twitch_id, twitch_token, twitch_refresh_token, twitch_refresh_epoc} = user;
        const newId = await refreshAccessToken(id, twitch_refresh_token, twitch_refresh_epoc);
        twitch_token = newId ? newId : twitch_token;

        // the first user will be used to get the streamer ids
        if (!hasGotStreamerIds) {
            streamerIds = await getStreamersIds(streamerUsernames, twitch_token);
            hasGotStreamerIds = true;
        }


        for (let i = 0; i < streamerIds.length; i++) {
            // check if they are subed all ready
            const currentSubTier = (await getIsUserSubTierFromDb(twitch_id, streamerUsernames[i]))?.[0]?.sub_tier || 0;
            let realSubTier = await checkSub(streamerIds[i], twitch_id, twitch_token);

            if (realSubTier === currentSubTier) { // do nothing as it is correct
                console.log("no change")
                continue;
            } else if (realSubTier === 0) { // they are no longer a sub so remove them
                console.log("remove")
                await removeUserSub(twitch_id, streamerUsernames[i]);
            } else if (currentSubTier === 0 && realSubTier > 0) { // they are a sub but have no entry in the db
                console.log("need to add")
                await insertUserSubByTwitchAndStreamer(twitch_id, streamerUsernames[i], realSubTier);
            } else { // they have a sub in the db but it has changed tier
                console.log("update")
                await updateUserSubTierByTwitchAndStreamer(twitch_id, streamerUsernames[i], realSubTier);
            }

        }

    }
}

const update_is_subed = async () => {
    const usersTwitchDetails = await getListOfAllUsersTwitchDetails();
    await updateIsSubed(usersTwitchDetails);

}
update_is_subed();
setInterval(update_is_subed, 1000 * 60 * 30);

app.listen(port, () => console.log(`App listening on port ${port}`));
