import { Request, Response } from "express";
import { RowDataPacket } from "mysql2/promise";

import { query } from "services/db";
import { convertTimes, match } from "services/match";

export default async (req: Request, res: Response) => {
    // ********************************* Get GiveLessons Data *********************************
    const giveLessonsResult = await query(
        `SELECT id,user_id,subject,times,min_class,max_class FROM GiveLessons`,
        []
    );

    // If there is a database error
    if (giveLessonsResult.error != undefined) {
        // Return 500
        res.status(500).json({ error: giveLessonsResult.error.message });
        return;
    }

    const giveLessonsRows = giveLessonsResult.result as RowDataPacket[];

    // If no giveLessons data exists
    if (!giveLessonsRows || (giveLessonsRows as any).length == 0) {
        // return 404 Not found
        res.status(404).json({ error: "No giveLesson data exists!" });
        return;
    }

    // ********************************* Get TakeLessons Data *********************************
    const takeLessonsResult = await query(
        `SELECT TakeLessons.id, TakeLessons.user_id, subject, times, C.name as class_name
        FROM TakeLessons
                 INNER JOIN Users U on TakeLessons.user_id = U.user_id
                 INNER JOIN Classes C on U.class_id = C.id`,
        []
    );

    // If there is a database error
    if (takeLessonsResult.error != undefined) {
        // Return 500
        res.status(500).json({ error: takeLessonsResult.error.message });
        return;
    }

    const takeLessonsRows = takeLessonsResult.result as RowDataPacket[];

    // If no takeLessons data exists
    if (!takeLessonsRows || (takeLessonsRows as any).length == 0) {
        // return 404 Not found
        res.status(404).json({ error: "No takeLesson data exists!" });
        return;
    }

    // For each takeLesson
    takeLessonsRows.forEach((row) => {
        // Get the classlevel with regex
        const classLevelMatch = (row.class_name as string).match(/^\d+/);
        // Add the classlevel to the row
        row.classLevel = classLevelMatch ? parseInt(classLevelMatch[0]) : 0;
        // Parse the times JSON string
        row.times = JSON.parse(row.times);
    });
    // For each giveLesson
    giveLessonsRows.forEach((row) => {
        // Parse the times JSON string
        row.times = JSON.parse(row.times);
    });

    // Convert the offers for being read with the matching algorithm
    const convertedTakeOffers = convertTimes(takeLessonsRows);
    const convertedGiveOffers = convertTimes(giveLessonsRows);

    // Return matching started and the data
    res.status(200).json({
        message: "Matching started",
        convertedTakeOffers,
        convertedGiveOffers,
    });
    // Run the matching (AFTER sending the response to now risk a timeout error)
    const matched = await match(convertedTakeOffers, convertedGiveOffers);

    // Merge the deep array to a single long one
    const matchingsData = [].concat(...(matched.matchings as any[]));

    // Add the matchings to the Database
    const insertResult = await query(
        // Inserting multiple values at once using deep arrays is not working with query.execute=> using workaround
        `
        INSERT INTO  Matches(takeLessons_id, giveLessons_id, time) VALUES ` +
            "(?,?,?),".repeat(matchingsData.length / 3 - 1) +
            "(?,?,?)",

        matchingsData,
        true
    );

    // If there is a database error
    if (insertResult.error != undefined) {
        // These errors are only logged to the console and not to the api
        console.log({ error: insertResult.error });
    }
};
