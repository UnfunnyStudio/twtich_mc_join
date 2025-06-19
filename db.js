import mysql from 'mysql';
import {env} from "./jsonenv.js";

export const dbConn = mysql.createPool({
    host: "unfunny.co.uk",
    user: env.db_username,
    password: env.db_password,
    database: env.database,
    connectionLimit: 10,
});

dbConn.getConnection((err, conn) => {
    if (err) {
        console.error("[DB ERROR]", err);
        process.exit(1);
    }
    console.log("Connected to the database pool");
    conn.release();
});
