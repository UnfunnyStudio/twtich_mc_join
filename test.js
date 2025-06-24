import {
    checkSub,
    getStreamersIds,
    getTwitchUsersData,
    getTwitchUsersDataWithToken,
    refreshAccessToken
} from "./src/twtich_side.js";
import {

    getIsUserSubTierFromDb,
    getListOfAllUsersTwitchDetails,
    getListOfStreamers, insertUserSubByTwitchAndStreamer, removeUserSub, updateUserSubTierByTwitchAndStreamer
} from "./src/dbCalls.js";


const update_is_subed = async () => {
    // get list of streamers
    const streamerUsernames = await getListOfStreamers();
    let hasGotStreamerIds = false;
    let streamerIds = [];

    // get all users twitch details
    const usersTwitchDetails = await getListOfAllUsersTwitchDetails();

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


};
update_is_subed();