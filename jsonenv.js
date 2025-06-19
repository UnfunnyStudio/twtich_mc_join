// this is my custom implementation of dotenv as I needed to be able to edit and save
// the values at runtime. To use import { env, SaveEnv }
import fs from 'fs'

if (!fs.existsSync("env.json")) {
    console.log("[ERROR] There is no `env.json` file");
    process.exit(1)
} // no file? die!

export let env = null;
try {
    const file_data = fs.readFileSync('env.json', 'utf8');
    env = JSON.parse(file_data);
} catch (e) {
    console.error("[ERROR] failed to read and parse `env.json` : " + e);
    process.exit(1)
}
console.log("[INFO] env file loaded");

// thread sage saving of the env file as we don't wany any illegal racing on you
// streets now do we :) (I will just change this to a generic file saver)
let env_write_in_progress = false;
let env_write_queue = []

export const SaveEnv = () => {
    if (env_write_in_progress) {
        env_write_queue.push(true);
        return;
    }
    env_write_in_progress = true;
    try {
        fs.writeFile('env.json', JSON.stringify(env, null, 2), (err) => {
            env_write_in_progress = false;
            if (env_write_queue.length > 0) {
                env_write_queue.pop();
                SaveEnv();
            }
        });
    } catch (e) {
        console.error("[WARN] failed to save `env.json` : " + e);
    }

}