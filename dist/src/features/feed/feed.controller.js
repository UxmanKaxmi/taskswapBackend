"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFeed = getFeed;
const feed_service_1 = require("./feed.service");
async function getFeed(req, res) {
    try {
        const userId = req.user?.id ?? null; // guest user → null
        const feed = await (0, feed_service_1.getFeedService)(userId);
        res.status(200).json({ success: true, feed });
    }
    catch (error) {
        console.error("Feed error:", error);
        res.status(500).json({ success: false, message: "Failed to load feed" });
    }
}
