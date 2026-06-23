/** Grudge Studio CDN + character roster for the Grudge Control showcase. */
export const GRUDGE_CDN = "https://assets.grudge-studio.com";
export const GRUDGE_API = "https://api.grudge-studio.com";
export const GRUDGE_ID = "https://id.grudge-studio.com";

const RACES = `${GRUDGE_CDN}/models/grudge6/races`;
const ANIM_BASE = `${GRUDGE_CDN}/models/animations/grudge6_brb/base`;
const GLOCO = `${GRUDGE_CDN}/models/animations/glocomotion`;

/** Shared Bip001 locomotion clips (grudge6_brb base pack on R2). */
export const GRUDGE6_LOCOMOTION = {
    idle: `${ANIM_BASE}/Idle.glb`,
    walk: `${ANIM_BASE}/Swagger Walk.glb`,
    run: `${ANIM_BASE}/Swagger Walk.glb`,
    jump: `${GLOCO}/jump.glb`,
};

export const GRUDGE6_ANIM_CONFIG = {
    idleAnim: "idle",
    walkAnim: "walk",
    runAnim: "run",
    jumpAnim: "jump",
    headBoneName: "Bip001 Head",
    rotateY: Math.PI,
    scale: 1,
    animationUrls: {
        idle: GRUDGE6_LOCOMOTION.idle,
        walk: GRUDGE6_LOCOMOTION.walk,
        run: GRUDGE6_LOCOMOTION.run,
        jump: GRUDGE6_LOCOMOTION.jump,
    },
};

/** Six core grudge6 races + extended roster mapped to CDN FBX models. */
export const GRUDGE_CHARACTERS = [
    { id: "human", name: "Human (WK)", faction: "Crusade", race: "human", url: `${RACES}/WK_Characters.fbx`, color: "#c9a227" },
    { id: "barbarian", name: "Barbarian (BRB)", faction: "Crusade", race: "barbarian", url: `${RACES}/BRB_Characters.fbx`, color: "#8b4513" },
    { id: "elf", name: "Elf (ELF)", faction: "Fabled", race: "elf", url: `${RACES}/ELF_Characters.fbx`, color: "#2ecc71" },
    { id: "dwarf", name: "Dwarf (DWF)", faction: "Fabled", race: "dwarf", url: `${RACES}/DWF_Characters.fbx`, color: "#3498db" },
    { id: "orc", name: "Orc (ORC)", faction: "Legion", race: "orc", url: `${RACES}/ORC_Characters.fbx`, color: "#27ae60" },
    { id: "undead", name: "Undead (UD)", faction: "Legion", race: "undead", url: `${RACES}/UD_Characters.fbx`, color: "#9b59b6" },
    { id: "werewolf", name: "Werewolf", faction: "Wild", race: "werewolf", url: `${GRUDGE_CDN}/models/characters/stylized_nightmarish_werewolf.glb`, color: "#e74c3c", scale: 0.001, isGlb: true },
    { id: "vampire", name: "Vampire Aristocrat", faction: "Legion", race: "undead", url: `${RACES}/UD_Characters.fbx`, color: "#6c3483" },
    { id: "goblin", name: "Goblin", faction: "Hostile", race: "orc", url: `${RACES}/ORC_Characters.fbx`, color: "#1e8449" },
    { id: "centaur", name: "Centaur", faction: "Wild", race: "barbarian", url: `${RACES}/BRB_Characters.fbx`, color: "#d35400" },
];

export function buildPlayerModelConfig(character) {
    const base = { ...GRUDGE6_ANIM_CONFIG, url: character.url };
    if (character.isGlb) {
        return {
            ...base,
            scale: character.scale ?? 0.001,
            idleAnim: "idle1",
            walkAnim: "walk",
            runAnim: "run",
            jumpAnim: "jump",
            headBoneName: "mixamorigHead",
            animationUrls: undefined,
        };
    }
    return { ...base, scale: character.scale ?? 1 };
}