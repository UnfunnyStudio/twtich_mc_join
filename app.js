import {env} from './jsonenv.js'
import express from 'express'
import {dbConn} from './db.js'

const app = express()
app.set('view engine', 'ejs');
app.use(express.static('public'))
app.use(express.json());

const port = 3000;
const redirect_uri = env.redirect_uri || "http://localhost:3000/auth/twitch/callback";

async function fetchJSON(url, options) {
    const resp = await fetch(url, options);
    return resp.json();
}

async function getUserId(token) {
    const data = await fetchJSON("https://api.twitch.tv/helix/users", {
        headers: { "Authorization": `Bearer ${token}`, "Client-Id": env.client_id },
    });
    return data.data?.[0]?.id;
}

async function saveTokenToDb(userId, token, refreshToken, expiresAt, res) {
    const sql = `INSERT INTO twitch_sub_whitelist (twitch_id, twitch_token, twitch_refresh_token, token_expires_epoc) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE twitch_token = VALUES(twitch_token), twitch_refresh_token = VALUES(twitch_refresh_token), token_expires_epoc = VALUES(token_expires_epoc)`;
    dbConn.query(sql, [userId, token, refreshToken, expiresAt], (err) => {
        if (err) {
            console.error("[DB ERROR]", err);
            res.send("Database error, check logs");
            return;
        }
        res.render("callback", {token});
    });
}

async function CheckIfSubedTo(access_token, broadcaster_usernames) {
    let is_a_sub = false, tier = 0;
    const user_id = await getUserId(access_token);
    if (!user_id) return {is_a_sub, tier};
    const idsQuery = broadcaster_usernames.map(u => `login=${u}`).join("&");
    const data = await fetchJSON(`https://api.twitch.tv/helix/users?${idsQuery}`, {
        headers: { "Authorization": `Bearer ${access_token}`, "Client-Id": env.client_id },
    });
    for (const broadcaster of data.data) {
        const resp = await fetchJSON(`https://api.twitch.tv/helix/subscriptions/user?broadcaster_id=${broadcaster.id}&user_id=${user_id}`, {
            headers: { "Authorization": `Bearer ${access_token}`, "Client-Id": env.client_id },
        });
        if (resp.data?.[0]) {
            is_a_sub = true;
            tier = Math.max(tier, resp.data[0].tier / 1000);
        }
    }
    return {is_a_sub, tier};
}

app.get("/", (req, res) => res.render("index", {client_id: env.client_id, redirect_uri}));

app.get("/help", (req, res) => {
    res.render("help");
});


app.get("/auth/twitch/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) {
        res.send("Authentication error, check console");
        return;
    }
    const data = await fetchJSON("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: env.client_id, client_secret: env.client_secret, code, grant_type: "authorization_code", redirect_uri })
    });
    const expiresAt = Date.now() + data.expires_in * 1000 - 10;
    const userId = await getUserId(data.access_token);
    await saveTokenToDb(userId, data.access_token, data.refresh_token, expiresAt, res);
});

app.post("/api/java-entry", async (req, res) => {
    const { minecraft_name, twitch_token } = req.body;

    if (!minecraft_name || !twitch_token) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const player_data = await fetchJSON(`https://api.mojang.com/users/profiles/minecraft/${minecraft_name}`);
    if (!player_data?.id) {
        return res.status(400).json({ error: 'Invalid player name' });
    }

    const is_subed_data = await CheckIfSubedTo(twitch_token, ["unfunnyttv", "swag_charhar"]);
    const sql = `UPDATE twitch_sub_whitelist SET minecraft_uuid=?, is_currently_subed=?, sub_tier=? WHERE twitch_token=?;`;
    dbConn.query(sql, [player_data.id, is_subed_data.is_a_sub, is_subed_data.tier, twitch_token], (err) => {
        if (err) {
            console.error("[DB ERROR]", err);
            res.status(500).json({ error: "Database error, check logs" });
            return;
        }

        if (is_subed_data.is_a_sub) {
            res.status(200).json({ message: "Entry received successfully", subscribed: true });
        } else {
            res.status(200).json({ message: "Registered, but not subscribed", subscribed: false });
        }
    });
});

app.post("/api/bedrock-entry", async (req, res) => {
    let { bedrock_uuid, twitch_token } = req.body;

    if (!bedrock_uuid || !twitch_token) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!/^[0-9a-fA-F]{1,16}$/.test(bedrock_uuid)) {
        return res.status(400).json({ error: 'Invalid XUID format' });
    }
    bedrock_uuid = "0000000000000000"+bedrock_uuid;

    const is_subed_data = await CheckIfSubedTo(twitch_token, ["unfunnyttv", "swag_charhar"]);

    const sql = `UPDATE twitch_sub_whitelist 
                 SET bedrock_uuid=?, is_currently_subed=?, sub_tier=? 
                 WHERE twitch_token=?;`;
    dbConn.query(sql, [bedrock_uuid, is_subed_data.is_a_sub, is_subed_data.tier, twitch_token], (err) => {
        if (err) {
            console.error("[DB ERROR]", err);
            res.status(500).json({ error: "Database error, check logs" });
            return;
        }

        if (is_subed_data.is_a_sub) {
            res.status(200).json({ message: "Entry received successfully", subscribed: true });
        } else {
            res.status(200).json({ message: "Registered, but not subscribed", subscribed: false });
        }
    });
});


async function refreshAccessToken(refresh_token) {
    const data = await fetchJSON("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: env.client_id,
            client_secret: env.client_secret,
            refresh_token,
        }),
    });
    if (data?.access_token) {
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token ?? refresh_token,
            expires_at: Date.now() + data.expires_in * 1000 - 10,
        };
    }
    return null;
}

const update_is_subed = async () => {
    const sql = `SELECT id, twitch_token, twitch_refresh_token, token_expires_epoc 
                 FROM twitch_sub_whitelist`;
    dbConn.query(sql, async (err, results) => {
        if (err) {
            console.error("[DB ERROR]", err);
            return;
        }

        for (const row of results) {
            let { id, twitch_token, twitch_refresh_token, token_expires_epoc } = row;

            // Refresh token if expired
            if (Date.now() >= token_expires_epoc) {
                const refreshed = await refreshAccessToken(twitch_refresh_token);
                if (!refreshed) {
                    console.error(`[ERR] Could not refresh token for user ${id}`);
                    continue;
                }
                twitch_token = refreshed.access_token;
                twitch_refresh_token = refreshed.refresh_token;

                // Save new tokens
                dbConn.query(
                    `UPDATE twitch_sub_whitelist 
                     SET twitch_token=?, twitch_refresh_token=?, token_expires_epoc=? 
                     WHERE id=?`,
                    [twitch_token, twitch_refresh_token, refreshed.expires_at, id],
                    (err) => {
                        if (err) console.error(`[DB ERROR] Could not save refreshed tokens for id ${id}`, err);
                    }
                );
            }

            // Check subscription status
            const is_subed_data = await CheckIfSubedTo(twitch_token, ["unfunnyttv", "swag_charhar"]);
            dbConn.query(
                `UPDATE twitch_sub_whitelist 
                 SET is_currently_subed=?, sub_tier=? 
                 WHERE id=?`,
                [is_subed_data.is_a_sub, is_subed_data.tier, id],
                (err) => {
                    if (err) {
                        console.error(`[DB ERROR] Could not update subscription status for id ${id}`, err);
                    }
                }
            );
        }
    });
};
update_is_subed();
setInterval(update_is_subed, 1000 * 60 * 60);


app.listen(port, () => console.log(`App listening on port ${port}`));