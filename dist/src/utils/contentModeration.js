"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertPostableContent = assertPostableContent;
const AppError_1 = require("../errors/AppError");
const httpStatus_1 = require("../types/httpStatus");
const BANNED_PHRASES = [
    "kill yourself",
    "kys",
    "go die",
    "die in a fire",
    "i will kill you",
    "i'm going to kill you",
    "rape threat",
    "nazi propaganda",
];
const ABUSIVE_WORDS = [
    "whore",
    "slut",
    "retard",
    "cunt",
];
const SPAM_PHRASES = [
    "free money",
    "get rich quick",
    "work from home and earn",
    "guaranteed profit",
    "crypto giveaway",
    "click here now",
    "limited time offer",
];
const URL_PATTERN = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
function assertPostableContent(values) {
    const text = values
        .filter((value) => typeof value === "string")
        .join(" ")
        .trim();
    const finding = findObjectionableContent(text);
    if (finding) {
        throw new AppError_1.AppError("This content cannot be posted. Please edit it and try again.", httpStatus_1.HttpStatus.BAD_REQUEST, true, finding);
    }
}
function findObjectionableContent(text) {
    if (!text)
        return null;
    const normalized = normalizeForModeration(text);
    const compact = normalized.replace(/\s+/g, "");
    const phraseMatch = BANNED_PHRASES.find((phrase) => normalized.includes(phrase));
    if (phraseMatch) {
        return { type: "abuse", reason: "blocked_phrase" };
    }
    const abusiveWordMatch = ABUSIVE_WORDS.find((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(normalized));
    if (abusiveWordMatch) {
        return { type: "abuse", reason: "abusive_word" };
    }
    if (compact.includes("killyourself")) {
        return { type: "abuse", reason: "blocked_phrase" };
    }
    const links = text.match(URL_PATTERN) ?? [];
    const spamPhraseCount = SPAM_PHRASES.filter((phrase) => normalized.includes(phrase)).length;
    if (links.length >= 3) {
        return { type: "spam", reason: "too_many_links" };
    }
    if (links.length >= 1 && spamPhraseCount > 0) {
        return { type: "spam", reason: "spam_link" };
    }
    if (spamPhraseCount >= 2) {
        return { type: "spam", reason: "spam_phrases" };
    }
    return null;
}
function normalizeForModeration(text) {
    return text
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[@$!|0-9]/g, (char) => {
        switch (char) {
            case "@":
                return "a";
            case "$":
                return "s";
            case "!":
            case "|":
            case "1":
                return "i";
            case "0":
                return "o";
            default:
                return char;
        }
    })
        .replace(/[^a-z\s:/.-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
