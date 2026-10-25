import redBallIcon from "@assets/Balls/Red.png";
import orangeBallIcon from "@assets/Balls/Orange.png";
import jauneBallIcon from "@assets/Balls/Jaune.png";
import vertBallIcon from "@assets/Balls/Vert.png";
import cyanBallIcon from "@assets/Balls/Cyan.png";
import bleuBallIcon from "@assets/Balls/Bleu.png";
import violetBallIcon from "@assets/Balls/Violet.png";
import whiteBallIcon from "@assets/Balls/White.png";

export const DEFAULT_QUEST_ICON = "White.png" as const;

export const QUEST_ICON_FILES = [
  "White.png",
  "Red.png",
  "Orange.png",
  "Jaune.png",
  "Vert.png",
  "Cyan.png",
  "Bleu.png",
  "Violet.png",
] as const;

export type QuestIconFile = (typeof QUEST_ICON_FILES)[number];

export const QUEST_ICON_OPTIONS: Array<{
  file: QuestIconFile;
  label: string;
  src: string;
}> = [
  { file: "White.png", label: "White (Default)", src: whiteBallIcon },
  { file: "Red.png", label: "Red", src: redBallIcon },
  { file: "Orange.png", label: "Orange", src: orangeBallIcon },
  { file: "Jaune.png", label: "Jaune", src: jauneBallIcon },
  { file: "Vert.png", label: "Vert", src: vertBallIcon },
  { file: "Cyan.png", label: "Cyan", src: cyanBallIcon },
  { file: "Bleu.png", label: "Bleu", src: bleuBallIcon },
  { file: "Violet.png", label: "Violet", src: violetBallIcon },
];

const questIconMap: Record<QuestIconFile, string> = {
  "White.png": whiteBallIcon,
  "Red.png": redBallIcon,
  "Orange.png": orangeBallIcon,
  "Jaune.png": jauneBallIcon,
  "Vert.png": vertBallIcon,
  "Cyan.png": cyanBallIcon,
  "Bleu.png": bleuBallIcon,
  "Violet.png": violetBallIcon,
};

export function getQuestIconSrc(iconFile?: string | null): string {
  if (!iconFile) return questIconMap[DEFAULT_QUEST_ICON];
  return questIconMap[iconFile as QuestIconFile] ?? questIconMap[DEFAULT_QUEST_ICON];
}

