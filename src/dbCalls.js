import {dbConn} from "../db.js";


export const getListOfStreamers = async () => {
    return new Promise((resolve, reject) => {
        dbConn.query(
            `SELECT username
             FROM streamers`,
            (err, results) => {
                if (err) {
                    console.error(`[DB ERROR] failed to get streamer username list`, err);
                    return reject(err);
                }

                const streamerUsernames = results.map(user => user.username);
                resolve(streamerUsernames);
            }
        );
    });
};

export const getListOfAllUsersTwitchDetails = async () => {
    return new Promise((resolve, reject) => {
        dbConn.query(
            `SELECT id, twitch_id, twitch_token, twitch_refresh_token, twitch_refresh_epoc
             FROM users`,
            (err, results) => {
                if (err) {
                    console.error(`[DB ERROR] failed to get users twitch data`, err);
                    return reject(err);
                }


                resolve(results);
            }
        );
    });
};

export const getUsersTwitchDetails = async (twitch_token) => {
    return new Promise((resolve, reject) => {
        dbConn.query(
            `SELECT id, twitch_id, twitch_token, twitch_refresh_token, twitch_refresh_epoc
             FROM users WHERE twitch_token = ? LIMIT 1`,
            [twitch_token],
            (err, results) => {
                if (err) {
                    console.error(`[DB ERROR] failed to get users twitch data`, err);
                    return reject(err);
                }

                resolve(results);
            }
        );
    });
};

export const updateRefreshAccessToken = async (id, twitch_token, twitch_refresh_token, twitch_refresh_epoc) => {
    return new Promise((resolve, reject) => {
        dbConn.query(
            `UPDATE users
             SET twitch_token         = ?,
                 twitch_refresh_token = ?,
                 twitch_refresh_epoc  = ?
             WHERE id = ?`,
            [twitch_token, twitch_refresh_token, twitch_refresh_epoc, id],
            (err) => {
                if (err) {
                    console.error(`[DB ERROR] Could not save refreshed tokens for id ${id}`, err);
                    return reject(err);
                }
                resolve(true);
            }
        );
    });
};


export const getIsUserSubTierFromDb = async (twitch_id, streamerUsername) => {
    return new Promise((resolve, reject) => {
        dbConn.query(
            `SELECT s.tier AS sub_tier
             FROM users u
                      LEFT JOIN
                  is_subed_to s ON u.id = s.user_id_fk
                      LEFT JOIN
                  streamers st ON s.streamer_id_fk = st.id
             WHERE u.twitch_id = ?
               AND st.username = ?
             LIMIT 1;`,
            [twitch_id, streamerUsername],
            (err, results) => {
                if (err) {
                    console.error(`[DB ERROR] failed to get users twitch data`, err);
                    return reject(err);
                }

                resolve(results);
            }
        );
    });
};


export const updateUserSubTierByTwitchAndStreamer = async (twitch_id, streamerUsername, newTier) => {
    return new Promise((resolve, reject) => {
        dbConn.query(
            `UPDATE is_subed_to s
                JOIN users u ON s.user_id_fk = u.id
                JOIN streamers st ON s.streamer_id_fk = st.id
             SET s.tier = ?
             WHERE u.twitch_id = ?
               AND st.username = ?
             LIMIT 1;`,
            [newTier, twitch_id, streamerUsername],
            (err, result) => {
                if (err) {
                    console.error(`[DB ERROR] failed to update sub tier`, err);
                    return reject(err);
                }

                resolve(result);
            }
        );
    });
};


export const insertUserSubByTwitchAndStreamer = async (twitch_id, streamerUsername, tier) => {
    return new Promise((resolve, reject) => {
        dbConn.query(
            `INSERT INTO is_subed_to (user_id_fk, streamer_id_fk, tier)
             SELECT u.id, st.id, ?
             FROM users u
                      JOIN streamers st ON st.username = ?
             WHERE u.twitch_id = ?
             LIMIT 1;`,
            [tier, streamerUsername, twitch_id],
            (err, result) => {
                if (err) {
                    console.error(`[DB ERROR] failed to insert sub`, err);
                    return reject(err);
                }

                resolve(result);
            }
        );
    });
};

export const removeUserSub = async (twitch_id, streamerUsername) => {
    return new Promise((resolve, reject) => {
        dbConn.query(
            `DELETE s
             FROM is_subed_to s
                      JOIN users u ON s.user_id_fk = u.id
                      JOIN streamers st ON s.streamer_id_fk = st.id
             WHERE u.twitch_id = ?
               AND st.username = ?;`,
            [twitch_id, streamerUsername],
            (err, result) => {
                if (err) {
                    console.error(`[DB ERROR] Failed to remove sub row`, err);
                    return reject(err);
                }

                resolve(result.affectedRows); // You can check how many rows got removed
            }
        );
    });
};


export const addNewUsersTokens = async (twitch_id, twitch_token, twitch_refresh_token, twitch_refresh_epoc) => {
    console.log(twitch_id, twitch_token, twitch_refresh_token, twitch_refresh_epoc)
    return new Promise((resolve, reject) => {
        dbConn.query(
            `INSERT INTO users (twitch_id, twitch_token, twitch_refresh_token, twitch_refresh_epoc)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                                  twitch_token = VALUES(twitch_token),
                                  twitch_refresh_token = VALUES(twitch_refresh_token),
                                  twitch_refresh_epoc = VALUES(twitch_refresh_epoc);`,
            [twitch_id, twitch_token, twitch_refresh_token, twitch_refresh_epoc],
            (err, result) => {
                if (err) {
                    console.error(`[DB ERROR] failed to insert users tokens`, err);
                    return reject(err);
                }
                resolve(result);
            }
        );
    });
};


export const updateMinecraftUuid = async (minecraftUuid, token, isBedrock=false) => {
    return new Promise((resolve, reject) => {
        dbConn.query(
            `UPDATE users SET ${isBedrock ? "bedrock_uuid" : "minecraft_uuid"} = ? WHERE twitch_token = ?`,
            [minecraftUuid, token],
            (err, result) => {
                if (err) {
                    console.error(`[DB ERROR] failed to update minecraft uuid`, err);
                    return reject(err);
                }

                resolve(result);
            }
        );
    });
};
